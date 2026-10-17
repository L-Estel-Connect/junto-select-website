import "server-only";
import { MAX_TEST_REPLIES, PRIVATE_REPLY_WINDOW_MS, TEST_KEYWORDS, TEST_REPLY_TEXT } from "./config";
import { GraphError, sendPrivateReply } from "./graph";
import { matchesKeyword } from "./keyword";
import { FieldValue, Timestamp, eventsCol, locksCol, readState, readToken, stateRef, type InstagramTestState } from "./store";

export interface CommentChange {
  entryId: string;
  entryTime: number | null;
  commentId: string;
  parentId: string | null;
  text: string | null;
  fromId: string | null;
  fromUsername: string | null;
  mediaId: string | null;
  mediaProductType: string | null;
}

/**
 * Accepts both payload shapes Meta documents: `entry[].changes[] {field, value}`
 * and `entry[] {field, value}`. Returns only `comments` changes.
 */
export function extractCommentChanges(payload: unknown): { comments: CommentChange[]; fields: string[] } {
  const comments: CommentChange[] = [];
  const fields: string[] = [];
  // The docs show an outer array around {object, entry}; real deliveries may be a single object.
  const objects = Array.isArray(payload) ? payload : [payload];
  const entries = objects.flatMap((o) => {
    const entry = (o as { entry?: unknown[] } | null)?.entry;
    return Array.isArray(entry) ? entry : [];
  });
  for (const rawEntry of entries) {
    const entry = rawEntry as { id?: string | number; time?: number; changes?: unknown[]; field?: string; value?: unknown };
    const changes = Array.isArray(entry.changes) ? entry.changes : entry.field ? [entry] : [];
    for (const rawChange of changes) {
      const change = rawChange as { field?: string; value?: Record<string, unknown> };
      if (change.field) fields.push(change.field);
      if (change.field !== "comments" || !change.value) continue;
      const v = change.value as {
        id?: string | number;
        text?: string;
        parent_id?: string | number;
        from?: { id?: string | number; username?: string };
        media?: { id?: string | number; media_product_type?: string };
      };
      if (!v.id) continue;
      comments.push({
        entryId: String(entry.id ?? ""),
        entryTime: typeof entry.time === "number" ? entry.time : null,
        commentId: String(v.id),
        parentId: v.parent_id ? String(v.parent_id) : null,
        text: typeof v.text === "string" ? v.text : null,
        fromId: v.from?.id ? String(v.from.id) : null,
        fromUsername: v.from?.username ?? null,
        mediaId: v.media?.id ? String(v.media.id) : null,
        mediaProductType: v.media?.media_product_type ?? null,
      });
    }
  }
  return { comments, fields };
}

export type Decision =
  | "not_connected"
  | "other_account"
  | "own_comment"
  | "other_reel"
  | "no_keyword"
  | "not_test_commenter"
  | "too_old"
  | "dry_run"
  | "repeat_person"
  | "cap_reached"
  | "sent"
  | "send_failed";

/** Pure decision, before any write: why a comment would or would not get a reply. */
export function decide(c: CommentChange, s: InstagramTestState, nowMs: number): Decision | "send" {
  if (!s.token || !s.igUserId) return "not_connected";
  if (c.entryId && c.entryId !== s.igUserId && c.entryId !== s.oauthUserId) return "other_account";
  if ((c.fromId && c.fromId === s.igUserId) || (c.fromUsername && s.username && c.fromUsername.toLowerCase() === s.username.toLowerCase())) {
    return "own_comment";
  }
  if (!s.mediaId || c.mediaId !== s.mediaId) return "other_reel";
  if (!matchesKeyword(c.text, TEST_KEYWORDS)) return "no_keyword";
  if (!s.testCommenterUsername || !c.fromUsername || c.fromUsername.toLowerCase() !== s.testCommenterUsername.toLowerCase()) {
    return "not_test_commenter";
  }
  if (c.entryTime && nowMs - c.entryTime * 1000 > PRIVATE_REPLY_WINDOW_MS) return "too_old";
  if (!s.sendEnabled) return "dry_run";
  return "send";
}

/** Handles one comment. Idempotent: a re-delivered comment only bumps a counter. */
export async function handleComment(c: CommentChange): Promise<Decision | "duplicate_delivery"> {
  const eventRef = eventsCol.doc(c.commentId);
  try {
    await eventRef.create({
      receivedAt: FieldValue.serverTimestamp(),
      entryId: c.entryId,
      entryTime: c.entryTime,
      commentId: c.commentId,
      parentId: c.parentId,
      text: c.text?.slice(0, 300) ?? null,
      fromId: c.fromId,
      fromUsername: c.fromUsername,
      mediaId: c.mediaId,
      mediaProductType: c.mediaProductType,
      keywordMatched: matchesKeyword(c.text, TEST_KEYWORDS),
      deliveries: 1,
      decision: "pending",
    });
  } catch (error) {
    if ((error as { code?: number }).code === 6) {
      await eventRef.update({ deliveries: FieldValue.increment(1), lastDeliveryAt: FieldValue.serverTimestamp() });
      return "duplicate_delivery";
    }
    throw error;
  }

  const state = await readState();
  const pre = decide(c, state, Date.now());
  if (pre !== "send") {
    await eventRef.update({ decision: pre });
    return pre;
  }

  // Reserve the reply in one transaction: the person lock and the global cap.
  const lockRef = locksCol.doc(`${c.mediaId}_${c.fromId ?? c.fromUsername}`);
  const reserved = await stateRef.firestore.runTransaction(async (tx) => {
    const [stateSnap, lockSnap] = await Promise.all([tx.get(stateRef), tx.get(lockRef)]);
    const s = (stateSnap.data() as InstagramTestState | undefined) ?? {};
    if (!s.sendEnabled) return "dry_run" as const;
    if (lockSnap.exists) return "repeat_person" as const;
    if ((s.sentCount ?? 0) >= MAX_TEST_REPLIES) return "cap_reached" as const;
    const sentCount = (s.sentCount ?? 0) + 1;
    tx.set(lockRef, { commentId: c.commentId, fromUsername: c.fromUsername, at: FieldValue.serverTimestamp() });
    tx.set(stateRef, { sentCount, sendEnabled: sentCount < MAX_TEST_REPLIES, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return "reserved" as const;
  });
  if (reserved !== "reserved") {
    await eventRef.update({ decision: reserved });
    return reserved;
  }

  try {
    const token = await readToken(state);
    if (!token || !state.igUserId) throw new GraphError("not_connected", 400);
    const result = await sendPrivateReply(token, state.igUserId, c.commentId, TEST_REPLY_TEXT);
    await eventRef.update({
      decision: "sent",
      sentAt: FieldValue.serverTimestamp(),
      sentText: TEST_REPLY_TEXT,
      messageId: result.message_id ?? null,
      recipientId: result.recipient_id ?? null,
    });
    return "sent";
  } catch (error) {
    const g = error instanceof GraphError ? error : null;
    await eventRef.update({
      decision: "send_failed",
      error: {
        message: (error instanceof Error ? error.message : String(error)).slice(0, 300),
        status: g?.status ?? null,
        code: g?.code ?? null,
        subcode: g?.subcode ?? null,
        type: g?.type ?? null,
      },
    });
    return "send_failed";
  }
}

export { Timestamp };
