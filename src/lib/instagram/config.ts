import "server-only";
import { createHmac, hkdfSync } from "node:crypto";
import { getAppBaseUrl } from "@/lib/config/appBaseUrl";

/**
 * Instagram comment-to-DM automation (admin board, /admin/instagram).
 * Approved by Lara on 17 Oct 2026, replacing ManyChat once it works.
 *
 * When someone comments the keyword on the chosen Reel, the account sends
 * them ONE private reply (Meta's "private replies": one message per comment,
 * within 7 days of it). Safety limits enforced in code:
 *   - only the account named in INSTAGRAM_ACCOUNT_USERNAME can be connected;
 *   - nothing is sent unless an admin chose a Reel, a keyword and a message
 *     and switched the automation to "active" (it starts paused);
 *   - comments written before the automation was activated never get a
 *     message, so activating it doesn't message old commenters;
 *   - one message per comment and per person on a Reel, never to the
 *     account's own comments, at most `dailyLimit` messages a day;
 *   - the message text is stored by an admin, never taken from a webhook.
 * The only write calls to Instagram are the private reply and the comments
 * webhook subscription made when connecting. Nothing publishes, edits or
 * deletes content or changes the account's settings.
 */
export const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_DAILY_LIMIT = 100;
export const MAX_DAILY_LIMIT = 500;
export const MAX_REPLY_LENGTH = 900;
export const MAX_KEYWORD_LENGTH = 40;

export const GRAPH_VERSION = "v25.0";
export const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;
// Private replies need basic + manage_comments; sending needs manage_messages.
export const OAUTH_SCOPES = ["instagram_business_basic", "instagram_business_manage_comments", "instagram_business_manage_messages"];

export class InstagramConfigError extends Error {}

/** The one Instagram account this deployment may connect (production: juntoselect). */
export function getAllowedUsername(): string {
  const name = process.env.INSTAGRAM_ACCOUNT_USERNAME?.trim().replace(/^@/, "").toLowerCase();
  if (!name) throw new InstagramConfigError("INSTAGRAM_ACCOUNT_USERNAME is not configured");
  return name;
}

export function getInstagramAppId(): string {
  const id = process.env.INSTAGRAM_APP_ID?.trim();
  if (!id) throw new InstagramConfigError("INSTAGRAM_APP_ID is not configured");
  return id;
}

/** The Instagram app secret (Meta dashboard > Instagram > API setup). It also signs webhooks, verified on 17 Oct 2026. */
export function getInstagramAppSecret(): string {
  const secret = process.env.INSTAGRAM_APP_SECRET?.trim();
  if (!secret || secret.startsWith("disabled")) {
    throw new InstagramConfigError("INSTAGRAM_APP_SECRET is not configured");
  }
  return secret;
}

/** Shown to an admin and typed into the Meta dashboard; derived so no extra secret is needed. */
export function getWebhookVerifyToken(): string {
  return createHmac("sha256", getInstagramAppSecret()).update("junto-instagram:webhook-verify").digest("hex").slice(0, 40);
}

/** AES-256-GCM key for the stored access token, derived from the app secret. */
export function getTokenKey(): Buffer {
  return Buffer.from(hkdfSync("sha256", getInstagramAppSecret(), "junto-instagram", "access-token", 32));
}

export function getOAuthRedirectUri(): string {
  return `${getAppBaseUrl()}/api/admin/instagram/callback`;
}

export function getWebhookUrl(): string {
  return `${getAppBaseUrl()}/api/instagram/webhook`;
}

/** The message must carry exactly what an admin saved, with at least one https link. */
export function validateReplyText(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (!t || t.length > MAX_REPLY_LENGTH) return null;
  if (!/https:\/\/[^\s]+\.[^\s]+/.test(t)) return null;
  return t;
}

export function validateKeyword(keyword: unknown): string | null {
  if (typeof keyword !== "string") return null;
  const k = keyword.trim();
  if (!k || k.length > MAX_KEYWORD_LENGTH || !/[\p{L}\p{N}]/u.test(k)) return null;
  return k;
}
