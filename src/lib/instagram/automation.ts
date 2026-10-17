import "server-only";
import type { DocumentReference } from "firebase-admin/firestore";
import { DEFAULT_DAILY_LIMIT, PRIVATE_REPLY_WINDOW_MS } from "./config";
import {
  type AutomationView,
  type CommentChange,
  type Decision,
  FINAL_DECISIONS,
  MANUALLY_SENDABLE,
  UNSTORED_DECISIONS,
  decide,
  madridDay,
  writtenAtMs,
} from "./decide";
import { GraphError, getMe, getMedia, getSubscriptions, listComments, sendPrivateReply } from "./graph";
import { matchesKeyword } from "./keyword";
import {
  FieldValue,
  Timestamp,
  automationsCol,
  commentsCol,
  locksCol,
  readState,
  readToken,
  stateRef,
  type Automation,
  type InstagramState,
} from "./store";

export type Source = "webhook" | "api";

function describe(error: unknown): string {
  if (error instanceof GraphError) return `${error.message} (code ${error.code ?? "?"}${error.subcode ? `/${error.subcode}` : ""}, http ${error.status})`;
  return error instanceof Error ? error.message : String(error);
}

export async function findAutomation(mediaId: string | null): Promise<{ id: string; data: Automation } | null> {
  if (!mediaId) return null;
  const snap = await automationsCol.where("mediaId", "==", mediaId).limit(1).get();
  const doc = snap.docs[0];
  return doc ? { id: doc.id, data: doc.data() as Automation } : null;
}

/** The same decision, with sending impossible: used to (re)label comments without ever sending. */
function observe(c: CommentChange, s: InstagramState, auto: Automation | null, nowMs: number): Decision {
  // Labelled as if paused, whatever the real status, so the label shows what an
  // active automation would do and nothing can ever be sent from here.
  const view = auto ? ({ ...auto, status: "paused" } as AutomationView) : null;
  const d = decide(c, s, view, nowMs);
  return d === "send" ? "dry_run" : d;
}

function labels(c: CommentChange, auto: Automation | null, nowMs: number) {
  const writtenMs = writtenAtMs(c, nowMs);
  return {
    keywordMatched: !!auto?.keyword && matchesKeyword(c.text, [auto.keyword]),
    historical: !!auto?.createdAt && writtenMs < auto.createdAt.toMillis(),
  };
}

/**
 * Handles one comment, from the webhook or from the API check. Idempotent:
 * the comment id is the document id, so a comment seen twice (a webhook
 * retry, or the webhook after the API check) never sends twice; a second
 * sighting only refreshes its label. Comments on Reels without a listening
 * automation are not stored at all.
 */
export async function handleComment(c: CommentChange, source: Source): Promise<Decision | "duplicate"> {
  const [state, found] = await Promise.all([readState(), findAutomation(c.mediaId)]);
  const auto = found?.data ?? null;
  const now = Date.now();
  const pre = decide(c, state, auto, now);
  if (pre !== "send" && UNSTORED_DECISIONS.has(pre)) return pre;

  const ref = commentsCol.doc(c.commentId);
  try {
    await ref.create({
      receivedAt: FieldValue.serverTimestamp(),
      source,
      viaWebhook: source === "webhook",
      writtenAt: c.entryTime ?? null,
      entryId: c.entryId,
      commentId: c.commentId,
      parentId: c.parentId,
      text: c.text?.slice(0, 300) ?? null,
      fromId: c.fromId,
      fromUsername: c.fromUsername,
      mediaId: c.mediaId,
      automationId: found?.id ?? null,
      ...labels(c, auto, now),
      deliveries: source === "webhook" ? 1 : 0,
      decision: pre === "send" ? "sending" : pre,
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 6) throw error;
    const existing = (await ref.get()).data() ?? {};
    const update: Record<string, unknown> = {};
    if (source === "webhook") Object.assign(update, { viaWebhook: true, deliveries: FieldValue.increment(1), lastDeliveryAt: FieldValue.serverTimestamp() });
    if (!FINAL_DECISIONS.has(existing.decision)) Object.assign(update, { automationId: found?.id ?? null, ...labels(c, auto, now), decision: observe(c, state, auto, now) });
    if (Object.keys(update).length) await ref.update(update);
    return "duplicate";
  }
  if (pre !== "send") return pre;
  if (!found) return "no_automation";
  return deliver(c.commentId, found.id, c.fromId ?? c.fromUsername, state, { requireActive: true });
}

/**
 * Re-labels the stored comments of one automation after its keyword changed
 * or after the switch to multiple automations. Sending is impossible here:
 * a comment that would now match only becomes "historical", "dry_run" or
 * "before_activation". Sent and failed records are never touched.
 */
export async function relabelAutomation(id: string): Promise<number> {
  const [state, snap] = await Promise.all([readState(), automationsCol.doc(id).get()]);
  if (!snap.exists) return 0;
  const auto = snap.data() as Automation;
  const comments = await commentsCol.where("mediaId", "==", auto.mediaId).get();
  const now = Date.now();
  const updates: [DocumentReference, Record<string, unknown>][] = [];
  for (const doc of comments.docs) {
    const e = doc.data();
    if (FINAL_DECISIONS.has(e.decision)) {
      if (e.automationId !== id) updates.push([doc.ref, { automationId: id }]);
      continue;
    }
    const c: CommentChange = {
      entryId: e.entryId ?? "",
      entryTime: typeof e.writtenAt === "number" ? e.writtenAt : null,
      commentId: doc.id,
      parentId: e.parentId ?? null,
      text: e.text ?? null,
      fromId: e.fromId ?? null,
      fromUsername: e.fromUsername ?? null,
      mediaId: e.mediaId ?? null,
      mediaProductType: null,
    };
    const next = { automationId: id, ...labels(c, auto, now), decision: observe(c, state, auto, now) };
    if (next.decision !== e.decision || next.keywordMatched !== e.keywordMatched || next.historical !== e.historical || e.automationId !== id) {
      updates.push([doc.ref, next]);
    }
  }
  for (let i = 0; i < updates.length; i += 400) {
    const batch = commentsCol.firestore.batch();
    updates.slice(i, i + 400).forEach(([ref, data]) => batch.update(ref, data));
    await batch.commit();
  }
  return updates.length;
}

/**
 * One-time move from the single automation (fields on the state doc) to
 * one automation per Reel. The current Reel keeps its keyword and message;
 * other Reels that already have comment records get an automation that is
 * switched off, with the message they were last sent, so nothing is lost.
 * Never activates anything, and every existing comment becomes historical.
 */
export async function migrateLegacyState(by: string): Promise<void> {
  const s = await readState();
  if (s.migratedAt) return;
  const existing = await automationsCol.limit(1).get();
  const now = Timestamp.now();
  const created: string[] = [];
  if (existing.empty) {
    const mediaIds = new Set<string>();
    if (s.mediaId) mediaIds.add(s.mediaId);
    const comments = await commentsCol.select("mediaId", "sentText", "sentAt").get();
    const lastSentText = new Map<string, { text: string; at: number }>();
    for (const d of comments.docs) {
      const e = d.data();
      if (!e.mediaId) continue;
      mediaIds.add(e.mediaId);
      const at = (e.sentAt as Timestamp | undefined)?.toMillis() ?? 0;
      if (e.sentText && at >= (lastSentText.get(e.mediaId)?.at ?? 0)) lastSentText.set(e.mediaId, { text: e.sentText, at });
    }
    for (const mediaId of mediaIds) {
      const isCurrent = mediaId === s.mediaId;
      const ref = automationsCol.doc();
      const auto: Automation = {
        mediaId,
        mediaPermalink: isCurrent ? (s.mediaPermalink ?? null) : null,
        mediaCaption: isCurrent ? (s.mediaCaption ?? null) : null,
        keyword: isCurrent ? (s.keyword ?? null) : null,
        replyText: (isCurrent ? s.replyText : null) ?? lastSentText.get(mediaId)?.text ?? null,
        status: isCurrent && s.status && s.status !== "off" ? "paused" : "off",
        createdAt: now,
        createdBy: `${by} (migration)`,
        activeSince: null,
      };
      await ref.set({ ...auto, updatedAt: FieldValue.serverTimestamp() });
      created.push(ref.id);
    }
  }
  await stateRef.set({ migratedAt: now, status: "off" }, { merge: true });
  for (const id of created) await relabelAutomation(id);
}

/**
 * Reserves then sends the one private reply for a comment. The reservation
 * (the person lock and the daily limit) is a transaction, so two deliveries
 * of the same comment, or two comments from one person, never send twice.
 * A failed send keeps its lock; an admin can retry it from the board.
 */
async function deliver(commentId: string, automationId: string, person: string | null, state: InstagramState, opts: { requireActive: boolean; by?: string }): Promise<Decision> {
  const ref = commentsCol.doc(commentId);
  const autoRef = automationsCol.doc(automationId);
  const today = madridDay(Date.now());
  const reserved = await stateRef.firestore.runTransaction(async (tx) => {
    const [stateSnap, autoSnap] = await Promise.all([tx.get(stateRef), tx.get(autoRef)]);
    const auto = autoSnap.data() as Automation | undefined;
    if (!auto || !auto.replyText) return { result: "not_configured" as const };
    const lockRef = locksCol.doc(`${auto.mediaId}_${person ?? commentId}`);
    const lockSnap = await tx.get(lockRef);
    const s = (stateSnap.data() as InstagramState | undefined) ?? {};
    if (opts.requireActive && auto.status !== "active") return { result: "dry_run" as const };
    if (lockSnap.exists && lockSnap.data()?.commentId !== commentId) return { result: "repeat_person" as const };
    const count = s.dailyDate === today ? (s.dailyCount ?? 0) : 0;
    if (count >= (s.dailyLimit ?? DEFAULT_DAILY_LIMIT)) return { result: "daily_limit" as const };
    tx.set(lockRef, { commentId, automationId, at: FieldValue.serverTimestamp() });
    tx.set(stateRef, { dailyDate: today, dailyCount: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { result: "reserved" as const, text: auto.replyText };
  });
  if (reserved.result !== "reserved") {
    await ref.update({ decision: reserved.result });
    return reserved.result;
  }

  const text = reserved.text;
  try {
    const token = await readToken(state);
    if (!token || !state.igUserId) throw new GraphError("not_connected", 400);
    const result = await sendPrivateReply(token, state.igUserId, commentId, text);
    await Promise.all([
      ref.update({
        decision: "sent",
        sentAt: FieldValue.serverTimestamp(),
        sentText: text,
        sentBy: opts.by ?? "automation",
        messageId: result.message_id ?? null,
        recipientId: result.recipient_id ?? null,
        error: FieldValue.delete(),
      }),
      stateRef.set({ sentTotal: FieldValue.increment(1) }, { merge: true }),
    ]);
    return "sent";
  } catch (error) {
    const g = error instanceof GraphError ? error : null;
    console.error("instagram: private reply failed", commentId, g ? `${g.code}/${g.subcode} ${g.message}` : (error as Error)?.message);
    await ref.update({
      decision: "send_failed",
      failedAt: FieldValue.serverTimestamp(),
      error: { message: describe(error).slice(0, 300), status: g?.status ?? null, code: g?.code ?? null, subcode: g?.subcode ?? null, type: g?.type ?? null },
    });
    return "send_failed";
  }
}

/**
 * An admin's explicit "send to this one comment": to check delivery, to
 * retry a failure, or to answer a historical comment by hand. Only for a
 * stored keyword comment of an automation, within Meta's 7 days, never
 * already sent.
 */
export async function sendToOneComment(commentId: string, by: string): Promise<Decision | "not_found" | "not_allowed"> {
  const state = await readState();
  const snap = await commentsCol.doc(commentId).get();
  if (!snap.exists) return "not_found";
  const e = snap.data() as { mediaId?: string; fromId?: string; fromUsername?: string; keywordMatched?: boolean; decision?: string; writtenAt?: number | null; receivedAt?: Timestamp };
  const found = await findAutomation(e.mediaId ?? null);
  if (!found || !e.decision || !MANUALLY_SENDABLE.has(e.decision) || !e.keywordMatched) return "not_allowed";
  const writtenMs = e.writtenAt ? e.writtenAt * 1000 : (e.receivedAt?.toMillis() ?? 0);
  if (Date.now() - writtenMs > PRIVATE_REPLY_WINDOW_MS) return "not_allowed";
  return deliver(commentId, found.id, e.fromId ?? e.fromUsername ?? null, state, { requireActive: false, by });
}

export interface ReelHealth {
  ok: boolean;
  commentsCount?: number | null;
  visible?: number;
  error?: string;
}

export interface Health {
  checkedAt: string;
  account: { ok: boolean; username?: string; accountType?: string | null; error?: string };
  subscription: { ok: boolean; fields: string[]; error?: string };
  reels: Record<string, ReelHealth>;
}

/**
 * Checks the connection with the Instagram API directly (no webhook): token,
 * comments subscription, and, for each automation that isn't off, its Reel
 * and the comments the API shows on it. Each of those comments goes through
 * handleComment like a webhook would, so a comment Meta failed to deliver is
 * still detected. Run on every board refresh.
 */
export async function checkAndSync(): Promise<Health> {
  const s = await readState();
  const h: Health = { checkedAt: new Date().toISOString(), account: { ok: false }, subscription: { ok: false, fields: [] }, reels: {} };
  const token = await readToken(s).catch(() => null);
  if (!token) {
    h.account.error = "not_connected";
    return h;
  }
  try {
    const me = await getMe(token);
    h.account = { ok: true, username: me.username, accountType: me.account_type ?? null };
  } catch (error) {
    h.account.error = describe(error);
  }
  try {
    const raw = (await getSubscriptions(token)) as { data?: { subscribed_fields?: string[] }[] };
    const fields = (raw.data ?? []).flatMap((x) => x.subscribed_fields ?? []);
    h.subscription = { ok: fields.includes("comments"), fields };
  } catch (error) {
    h.subscription.error = describe(error);
  }
  const autos = await automationsCol.get();
  for (const doc of autos.docs) {
    const auto = doc.data() as Automation;
    if (auto.status === "off") continue;
    const r: ReelHealth = { ok: false };
    try {
      const m = await getMedia(token, auto.mediaId);
      r.commentsCount = m.comments_count ?? null;
      const comments = await listComments(token, auto.mediaId);
      r.visible = comments.length;
      r.ok = true;
      for (const c of comments) {
        await handleComment(
          {
            entryId: s.igUserId ?? "",
            entryTime: c.timestamp ? Math.floor(Date.parse(c.timestamp) / 1000) : null,
            commentId: c.id,
            parentId: c.parent_id ?? null,
            text: c.text ?? null,
            fromId: c.from?.id ?? null,
            fromUsername: c.from?.username ?? c.username ?? null,
            mediaId: auto.mediaId,
            mediaProductType: null,
          },
          "api",
        ).catch((error) => console.error("instagram: api comment handling failed", c.id, describe(error)));
      }
    } catch (error) {
      r.error = describe(error);
    }
    h.reels[doc.id] = r;
  }
  await stateRef.set({ lastHealth: h }, { merge: true }).catch(() => {});
  console.log(
    "instagram health",
    JSON.stringify({
      account: h.account.ok ? `@${h.account.username}` : h.account.error,
      subscribed: h.subscription.fields,
      reels: Object.fromEntries(Object.entries(h.reels).map(([id, r]) => [id, r.ok ? `${r.visible}/${r.commentsCount}` : r.error])),
    }),
  );
  return h;
}
