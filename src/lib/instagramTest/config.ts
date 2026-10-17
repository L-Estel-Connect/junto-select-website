import "server-only";
import { createHmac, hkdfSync } from "node:crypto";
import { isStagingDeploy } from "@/lib/config/deployEnv";
import { getAppBaseUrl } from "@/lib/config/appBaseUrl";

/**
 * Instagram Comment-to-DM ACCESS TEST (Phase 1, approved by Lara on
 * 17 Oct 2026). A temporary proof of concept, not the Instagram feature:
 * it answers "does Meta deliver comment webhooks to our app, and can we send
 * one private reply with a link?" on STAGING only.
 *
 * Hard limits, enforced in code rather than by configuration:
 *   - every route answers 404 outside a staging deployment;
 *   - only the Instagram account below can be connected;
 *   - nothing is ever sent unless an admin chose ONE Reel, named ONE test
 *     commenter and switched sending on (off by default, dry run otherwise);
 *   - at most MAX_TEST_REPLIES private replies in total, then sending turns
 *     itself off;
 *   - one reply per comment and per person, never to our own comments;
 *   - the message text is fixed here, never taken from a request.
 * Nothing here publishes, edits or deletes content or changes account
 * settings: the only write call to Instagram is the private reply, plus the
 * webhook subscription made when connecting.
 */
export const ALLOWED_INSTAGRAM_USERNAME = "lara_estel";
export const MAX_TEST_REPLIES = 3;
export const TEST_KEYWORDS = ["select"];
export const TEST_REPLY_TEXT =
  "¡Hola! Gracias por tu interés en Junto Select. Aquí tienes el enlace para solicitar tu invitación: https://www.juntoselect.com/unete";
/** Meta only allows a private reply within 7 days of the comment. */
export const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const GRAPH_VERSION = "v25.0";
export const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;
// The private-replies page lists basic + manage_comments; the messaging page lists manage_messages for sending. Ask for all three.
export const OAUTH_SCOPES = ["instagram_business_basic", "instagram_business_manage_comments", "instagram_business_manage_messages"];

export function instagramTestEnabled(): boolean {
  return isStagingDeploy();
}

export class InstagramTestConfigError extends Error {}

export function getInstagramAppId(): string {
  const id = process.env.INSTAGRAM_TEST_APP_ID?.trim();
  if (!id) throw new InstagramTestConfigError("INSTAGRAM_TEST_APP_ID is not configured");
  return id;
}

export function getInstagramAppSecret(): string {
  const secret = process.env.INSTAGRAM_TEST_APP_SECRET?.trim();
  if (!secret || secret.startsWith("disabled")) {
    throw new InstagramTestConfigError("INSTAGRAM_TEST_APP_SECRET is not configured");
  }
  return secret;
}

/** Shown to an admin on the test page and typed into the Meta dashboard; derived so no extra secret is needed. */
export function getWebhookVerifyToken(): string {
  return createHmac("sha256", getInstagramAppSecret()).update("junto-instagram-test:webhook-verify").digest("hex").slice(0, 40);
}

/** AES-256-GCM key for the stored access token, derived from the app secret. */
export function getTokenKey(): Buffer {
  return Buffer.from(hkdfSync("sha256", getInstagramAppSecret(), "junto-instagram-test", "access-token", 32));
}

export function getOAuthRedirectUri(): string {
  return `${getAppBaseUrl()}/api/admin/instagram-test/callback`;
}

export function getWebhookUrl(): string {
  return `${getAppBaseUrl()}/api/instagram-test/webhook`;
}
