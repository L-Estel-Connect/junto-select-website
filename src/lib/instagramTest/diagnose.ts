import "server-only";
import { TEST_KEYWORDS } from "./config";
import { GraphError, getMe, getMedia, getSubscriptions, listComments } from "./graph";
import { matchesKeyword } from "./keyword";
import { FieldValue, readState, readToken, stateRef } from "./store";
import { decide, type CommentChange } from "./webhook";

function describe(error: unknown): string {
  if (error instanceof GraphError) return `${error.message} (code ${error.code ?? "?"}${error.subcode ? `/${error.subcode}` : ""}, http ${error.status})`;
  return error instanceof Error ? error.message : String(error);
}

export interface ApiCommentCheck {
  commentId: string;
  username: string | null;
  text: string | null;
  timestamp: string | null;
  isReply: boolean;
  keywordMatched: boolean;
  /** What the webhook handler would decide for this comment, with sending forced off. */
  decision: string;
  /** Whether Meta ever delivered this comment through the webhook. */
  receivedByWebhook: boolean;
}

export interface Diagnosis {
  checkedAt: string;
  account: { ok: boolean; username?: string; igUserId?: string; accountType?: string | null; error?: string };
  subscription: { ok: boolean; fields: string[]; raw?: unknown; error?: string };
  reel: { ok: boolean; mediaId?: string | null; permalink?: string | null; productType?: string | null; commentsCount?: number | null; error?: string };
  comments: { ok: boolean; items: ApiCommentCheck[]; error?: string };
}

/**
 * Read-only check against the Instagram API, independent of webhooks: is
 * the token valid, is the app subscribed to `comments`, does the chosen
 * Reel exist, and which comments does the API itself show on it. Each
 * comment is run through the same decision as the webhook, with sending
 * forced OFF, so a real comment can be shown as "would reply" even when
 * Meta never delivers the webhook. Nothing is ever sent from here.
 * The result (no token, no secret) is saved on the state doc and logged.
 */
export async function runDiagnosis(isWebhookDelivered: (commentId: string) => Promise<boolean>): Promise<Diagnosis> {
  const s = await readState();
  const token = await readToken(s).catch(() => null);
  const d: Diagnosis = {
    checkedAt: new Date().toISOString(),
    account: { ok: false },
    subscription: { ok: false, fields: [] },
    reel: { ok: false, mediaId: s.mediaId ?? null },
    comments: { ok: false, items: [] },
  };
  if (!token) {
    d.account.error = "not_connected";
    return d;
  }

  try {
    const me = await getMe(token);
    d.account = { ok: true, username: me.username, igUserId: String(me.user_id ?? me.id), accountType: me.account_type ?? null };
  } catch (error) {
    d.account.error = describe(error);
  }

  try {
    const raw = (await getSubscriptions(token)) as { data?: { subscribed_fields?: string[] }[] };
    const fields = (raw.data ?? []).flatMap((x) => x.subscribed_fields ?? []);
    d.subscription = { ok: fields.includes("comments"), fields, raw };
  } catch (error) {
    d.subscription.error = describe(error);
  }

  if (s.mediaId) {
    try {
      const m = await getMedia(token, s.mediaId);
      d.reel = { ok: true, mediaId: m.id, permalink: m.permalink ?? null, productType: m.media_product_type ?? null, commentsCount: m.comments_count ?? null };
    } catch (error) {
      d.reel.error = describe(error);
    }
    try {
      const comments = await listComments(token, s.mediaId);
      const forcedOff = { ...s, sendEnabled: false };
      const items: ApiCommentCheck[] = [];
      for (const c of comments) {
        const change: CommentChange = {
          entryId: s.igUserId ?? "",
          entryTime: c.timestamp ? Math.floor(Date.parse(c.timestamp) / 1000) : null,
          commentId: c.id,
          parentId: c.parent_id ?? null,
          text: c.text ?? null,
          fromId: c.from?.id ?? null,
          fromUsername: c.from?.username ?? c.username ?? null,
          mediaId: s.mediaId,
          mediaProductType: d.reel.productType ?? null,
        };
        const decision = decide(change, forcedOff, Date.now());
        items.push({
          commentId: c.id,
          username: change.fromUsername,
          text: c.text?.slice(0, 300) ?? null,
          timestamp: c.timestamp ?? null,
          isReply: !!c.parent_id,
          keywordMatched: matchesKeyword(c.text, TEST_KEYWORDS),
          decision: decision === "send" ? "dry_run" : decision,
          receivedByWebhook: await isWebhookDelivered(c.id),
        });
      }
      d.comments = { ok: true, items };
    } catch (error) {
      d.comments.error = describe(error);
    }
  } else {
    d.reel.error = "no_reel_chosen";
  }

  await stateRef.set({ lastDiagnosis: d, updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
  console.log(
    "instagram-test diagnosis",
    JSON.stringify({
      account: d.account.ok ? `ok @${d.account.username} ${d.account.accountType}` : d.account.error,
      subscribedFields: d.subscription.fields,
      subscriptionError: d.subscription.error ?? null,
      reel: d.reel.ok ? `ok ${d.reel.productType} comments_count=${d.reel.commentsCount}` : d.reel.error,
      comments: d.comments.ok
        ? d.comments.items.map((c) => `${c.username}: "${(c.text ?? "").slice(0, 40)}" keyword=${c.keywordMatched} decision=${c.decision} webhook=${c.receivedByWebhook}`)
        : d.comments.error,
    }),
  );
  return d;
}
