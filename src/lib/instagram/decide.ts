import { PRIVATE_REPLY_WINDOW_MS } from "./config";
import { matchesKeyword } from "./keyword";

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
  | "no_automation"
  | "automation_off"
  | "own_comment"
  | "no_keyword"
  | "historical"
  | "too_old"
  | "not_configured"
  | "dry_run"
  | "before_activation"
  | "repeat_person"
  | "daily_limit"
  | "sending"
  | "sent"
  | "send_failed";

/** Decisions for comments that are not stored at all (no automation is listening on that Reel). */
export const UNSTORED_DECISIONS: ReadonlySet<Decision> = new Set(["not_connected", "other_account", "no_automation", "automation_off"]);

/** Outcomes of a send attempt. They are never re-evaluated, so a sent comment always stays sent. */
export const FINAL_DECISIONS: ReadonlySet<string> = new Set(["sending", "sent", "send_failed", "repeat_person", "daily_limit"]);

/** Keyword comments an admin may still answer by hand (never automatically). */
export const MANUALLY_SENDABLE: ReadonlySet<string> = new Set(["historical", "dry_run", "before_activation", "send_failed", "daily_limit"]);

interface Millis {
  toMillis(): number;
}

/** What `decide` needs from the account (instagramAutomation/state). */
export interface AccountView {
  token?: unknown;
  igUserId?: string;
  oauthUserId?: string;
  username?: string;
}

/** What `decide` needs from one Reel automation (instagramAutomations/{id}). */
export interface AutomationView {
  mediaId: string;
  keyword?: string | null;
  replyText?: string | null;
  status: "off" | "paused" | "active";
  /** Comments written before the automation existed are historical: never sent automatically. */
  createdAt?: Millis | null;
  /** Comments written before the latest activation are never sent automatically either. */
  activeSince?: Millis | null;
}

export function writtenAtMs(c: Pick<CommentChange, "entryTime">, nowMs: number): number {
  return c.entryTime ? c.entryTime * 1000 : nowMs;
}

/**
 * Pure decision, before any write: why a comment would or would not get the
 * automation's message. Only "send" leads to a message, and only for a
 * comment written after the automation was created AND after its latest
 * activation, so nothing is ever sent retroactively.
 */
export function decide(c: CommentChange, account: AccountView, auto: AutomationView | null, nowMs: number): Decision | "send" {
  if (!account.token || !account.igUserId) return "not_connected";
  if (c.entryId && c.entryId !== account.igUserId && c.entryId !== account.oauthUserId) return "other_account";
  if (!auto || !c.mediaId || c.mediaId !== auto.mediaId) return "no_automation";
  if (auto.status === "off") return "automation_off";
  if ((c.fromId && c.fromId === account.igUserId) || (c.fromUsername && account.username && c.fromUsername.toLowerCase() === account.username.toLowerCase())) {
    return "own_comment";
  }
  if (!auto.keyword || !matchesKeyword(c.text, [auto.keyword])) return "no_keyword";
  const writtenMs = writtenAtMs(c, nowMs);
  if (auto.createdAt && writtenMs < auto.createdAt.toMillis()) return "historical";
  if (nowMs - writtenMs > PRIVATE_REPLY_WINDOW_MS) return "too_old";
  if (!auto.replyText) return "not_configured";
  if (auto.status !== "active") return "dry_run";
  if (!auto.activeSince || writtenMs < auto.activeSince.toMillis()) return "before_activation";
  return "send";
}

/** The calendar day the daily limit counts in (Spain). */
export function madridDay(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(nowMs);
}
