import { PRIVATE_REPLY_WINDOW_MS } from "./config";
import { matchesKeyword } from "./keyword";
import type { InstagramState } from "./store";

export interface CommentChange {
  entryId: string;
  /** When the comment was written, in seconds (webhook entry time or API timestamp). */
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
 * Accepts every payload shape Meta documents: `entry[].changes[] {field, value}`,
 * `entry[] {field, value}`, and either wrapped in an outer array. Returns only
 * `comments` changes.
 */
export function extractCommentChanges(payload: unknown): { comments: CommentChange[]; fields: string[] } {
  const comments: CommentChange[] = [];
  const fields: string[] = [];
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
  | "automation_off"
  | "other_reel"
  | "own_comment"
  | "no_keyword"
  | "too_old"
  | "not_configured"
  | "dry_run"
  | "before_activation"
  | "repeat_person"
  | "daily_limit"
  | "sending"
  | "sent"
  | "send_failed";

/** Decisions for comments that are not stored at all (not about the chosen Reel). */
export const UNSTORED_DECISIONS: ReadonlySet<Decision> = new Set(["not_connected", "other_account", "automation_off", "other_reel"]);

/** Pure decision, before any write: why a comment would or would not get the message. */
export function decide(c: CommentChange, s: InstagramState, nowMs: number): Decision | "send" {
  if (!s.token || !s.igUserId) return "not_connected";
  if (c.entryId && c.entryId !== s.igUserId && c.entryId !== s.oauthUserId) return "other_account";
  if (!s.status || s.status === "off") return "automation_off";
  if (!s.mediaId || c.mediaId !== s.mediaId) return "other_reel";
  if ((c.fromId && c.fromId === s.igUserId) || (c.fromUsername && s.username && c.fromUsername.toLowerCase() === s.username.toLowerCase())) {
    return "own_comment";
  }
  if (!s.keyword || !matchesKeyword(c.text, [s.keyword])) return "no_keyword";
  const writtenMs = c.entryTime ? c.entryTime * 1000 : nowMs;
  if (nowMs - writtenMs > PRIVATE_REPLY_WINDOW_MS) return "too_old";
  if (!s.replyText) return "not_configured";
  if (s.status !== "active") return "dry_run";
  if (s.activeSince && writtenMs < s.activeSince.toMillis()) return "before_activation";
  return "send";
}

/** The calendar day the daily limit counts in (Spain). */
export function madridDay(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(nowMs);
}
