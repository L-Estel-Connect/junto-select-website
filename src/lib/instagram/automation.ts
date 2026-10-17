import "server-only";
import { DEFAULT_DAILY_LIMIT, PRIVATE_REPLY_WINDOW_MS } from "./config";
import { type CommentChange, type Decision, UNSTORED_DECISIONS, decide, madridDay } from "./decide";
import { GraphError, getMe, getMedia, getSubscriptions, listComments, sendPrivateReply } from "./graph";
import { matchesKeyword } from "./keyword";
import { FieldValue, commentsCol, locksCol, readState, readToken, stateRef, type InstagramState } from "./store";

export type Source = "webhook" | "api";

function describe(error: unknown): string {
  if (error instanceof GraphError) return `${error.message} (code ${error.code ?? "?"}${error.subcode ? `/${error.subcode}` : ""}, http ${error.status})`;
  return error instanceof Error ? error.message : String(error);
}

/**
 * Handles one comment, from the webhook or from the API check. Idempotent:
 * the comment id is the document id, so a comment seen twice (a webhook
 * retry, or the webhook after the API check) is only marked as seen again.
 * Comments that aren't about the chosen Reel are not stored at all.
 */
export async function handleComment(c: CommentChange, source: Source): Promise<Decision | "duplicate"> {
  const state = await readState();
  const pre = decide(c, state, Date.now());
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
      keywordMatched: !!state.keyword && matchesKeyword(c.text, [state.keyword]),
      deliveries: source === "webhook" ? 1 : 0,
      decision: pre === "send" ? "sending" : pre,
    });
  } catch (error) {
    if ((error as { code?: number }).code === 6) {
      if (source === "webhook") {
        await ref.update({ viaWebhook: true, deliveries: FieldValue.increment(1), lastDeliveryAt: FieldValue.serverTimestamp() });
      }
      return "duplicate";
    }
    throw error;
  }
  if (pre !== "send") return pre;
  return deliver(c.commentId, c.mediaId, c.fromId ?? c.fromUsername, state, { requireActive: true });
}

/**
 * Reserves then sends the one private reply for a comment. The reservation
 * (the person lock and the daily limit) is a transaction, so two deliveries
 * of the same comment, or two comments from one person, never send twice.
 * A failed send keeps its lock; an admin can retry it from the board.
 */
async function deliver(
  commentId: string,
  mediaId: string | null,
  person: string | null,
  state: InstagramState,
  opts: { requireActive: boolean; by?: string },
): Promise<Decision> {
  const ref = commentsCol.doc(commentId);
  const lockRef = locksCol.doc(`${mediaId}_${person ?? commentId}`);
  const today = madridDay(Date.now());
  const reserved = await stateRef.firestore.runTransaction(async (tx) => {
    const [stateSnap, lockSnap] = await Promise.all([tx.get(stateRef), tx.get(lockRef)]);
    const s = (stateSnap.data() as InstagramState | undefined) ?? {};
    if (opts.requireActive && s.status !== "active") return "dry_run" as const;
    if (lockSnap.exists && lockSnap.data()?.commentId !== commentId) return "repeat_person" as const;
    const count = s.dailyDate === today ? (s.dailyCount ?? 0) : 0;
    if (count >= (s.dailyLimit ?? DEFAULT_DAILY_LIMIT)) return "daily_limit" as const;
    tx.set(lockRef, { commentId, at: FieldValue.serverTimestamp() });
    tx.set(stateRef, { dailyDate: today, dailyCount: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return "reserved" as const;
  });
  if (reserved !== "reserved") {
    await ref.update({ decision: reserved });
    return reserved;
  }

  const text = state.replyText ?? "";
  try {
    const token = await readToken(state);
    if (!token || !state.igUserId || !text) throw new GraphError("not_connected", 400);
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
 * An admin's explicit "send to this one comment": the board's way to check
 * delivery before activating the automation, and to retry a failed send.
 * Only for a stored keyword comment on the chosen Reel, within Meta's 7 days,
 * never already sent.
 */
export async function sendToOneComment(commentId: string, by: string): Promise<Decision | "not_found" | "not_allowed"> {
  const state = await readState();
  const snap = await commentsCol.doc(commentId).get();
  if (!snap.exists) return "not_found";
  const e = snap.data() as { mediaId?: string; fromId?: string; fromUsername?: string; keywordMatched?: boolean; decision?: string; writtenAt?: number | null; receivedAt?: { toMillis(): number } };
  const allowed = ["dry_run", "before_activation", "send_failed", "daily_limit"];
  if (!e.decision || !allowed.includes(e.decision) || !e.keywordMatched || e.mediaId !== state.mediaId) return "not_allowed";
  const writtenMs = e.writtenAt ? e.writtenAt * 1000 : (e.receivedAt?.toMillis() ?? 0);
  if (Date.now() - writtenMs > PRIVATE_REPLY_WINDOW_MS) return "not_allowed";
  return deliver(commentId, e.mediaId ?? null, e.fromId ?? e.fromUsername ?? null, state, { requireActive: false, by });
}

export interface Health {
  checkedAt: string;
  account: { ok: boolean; username?: string; accountType?: string | null; error?: string };
  subscription: { ok: boolean; fields: string[]; error?: string };
  reel: { ok: boolean; permalink?: string | null; commentsCount?: number | null; error?: string };
  apiComments: { ok: boolean; visible: number; error?: string };
}

/**
 * Checks the connection with the Instagram API directly (no webhook): token,
 * comments subscription, the chosen Reel, and the comments the API shows on
 * it. Each of those comments goes through handleComment like a webhook
 * would, so a comment Meta failed to deliver is still detected (and, when
 * the automation is active, answered). Run on every board refresh.
 */
export async function checkAndSync(): Promise<Health> {
  const s = await readState();
  const h: Health = {
    checkedAt: new Date().toISOString(),
    account: { ok: false },
    subscription: { ok: false, fields: [] },
    reel: { ok: false },
    apiComments: { ok: false, visible: 0 },
  };
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
  if (!s.mediaId) {
    h.reel.error = "no_reel_chosen";
    return h;
  }
  try {
    const m = await getMedia(token, s.mediaId);
    h.reel = { ok: true, permalink: m.permalink ?? null, commentsCount: m.comments_count ?? null };
  } catch (error) {
    h.reel.error = describe(error);
  }
  try {
    const comments = await listComments(token, s.mediaId);
    h.apiComments = { ok: true, visible: comments.length };
    if (s.status && s.status !== "off") {
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
            mediaId: s.mediaId,
            mediaProductType: null,
          },
          "api",
        ).catch((error) => console.error("instagram: api comment handling failed", c.id, describe(error)));
      }
    }
  } catch (error) {
    h.apiComments.error = describe(error);
  }
  await stateRef.set({ lastHealth: h }, { merge: true }).catch(() => {});
  console.log(
    "instagram health",
    JSON.stringify({
      account: h.account.ok ? `@${h.account.username}` : h.account.error,
      subscribed: h.subscription.fields,
      reelComments: h.reel.commentsCount ?? h.reel.error,
      apiVisible: h.apiComments.ok ? h.apiComments.visible : h.apiComments.error,
    }),
  );
  return h;
}
