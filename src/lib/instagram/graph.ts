import "server-only";
import { GRAPH_BASE, OAUTH_SCOPES, getInstagramAppId, getInstagramAppSecret, getOAuthRedirectUri } from "./config";

/**
 * Minimal Instagram API (Instagram Login) client for the comment-to-DM automation. Access
 * tokens travel in the Authorization header or a POST body, never in a URL
 * we log, and errors carry only Meta's code/type/message, never a token.
 */
export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly subcode?: number,
    readonly type?: string,
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // fall through with data = null
  }
  const err = (data as { error?: { message?: string; code?: number; error_subcode?: number; type?: string } } | null)?.error;
  if (!res.ok || err) {
    const message = err?.message ?? (data as { error_message?: string } | null)?.error_message ?? `http_${res.status}`;
    throw new GraphError(message.slice(0, 300), res.status, err?.code, err?.error_subcode, err?.type);
  }
  return data as T;
}

export function authorizeUrl(state: string): string {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", getInstagramAppId());
  url.searchParams.set("redirect_uri", getOAuthRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPES.join(","));
  url.searchParams.set("state", state);
  url.searchParams.set("enable_fb_login", "0");
  url.searchParams.set("force_reauth", "true");
  return url.toString();
}

/** Code → short-lived token → 60-day token. */
export async function exchangeCode(code: string): Promise<{ accessToken: string; expiresInSeconds: number; userId: string; permissions: string[] }> {
  const form = new URLSearchParams({
    client_id: getInstagramAppId(),
    client_secret: getInstagramAppSecret(),
    grant_type: "authorization_code",
    redirect_uri: getOAuthRedirectUri(),
    code,
  });
  const short = await parse<{
    access_token?: string;
    user_id?: string | number;
    permissions?: string[] | string;
    data?: { access_token: string; user_id: string | number; permissions?: string[] | string }[];
  }>(await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form }));
  const first = short.data?.[0] ?? short;
  if (!first.access_token) throw new GraphError("no_access_token_in_response", 500);
  const permissions = Array.isArray(first.permissions) ? first.permissions : (first.permissions ?? "").split(",").filter(Boolean);

  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", getInstagramAppSecret());
  longUrl.searchParams.set("access_token", first.access_token);
  const long = await parse<{ access_token: string; expires_in: number }>(await fetch(longUrl));
  return { accessToken: long.access_token, expiresInSeconds: long.expires_in, userId: String(first.user_id ?? ""), permissions };
}

function bearer(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function getMe(token: string): Promise<{ id: string; user_id?: string; username: string; account_type?: string }> {
  return parse(await fetch(`${GRAPH_BASE}/me?fields=id,user_id,username,account_type`, { headers: bearer(token) }));
}

export async function subscribeToComments(token: string): Promise<{ success?: boolean }> {
  return parse(
    await fetch(`${GRAPH_BASE}/me/subscribed_apps?subscribed_fields=comments`, { method: "POST", headers: bearer(token) }),
  );
}

export async function getSubscriptions(token: string): Promise<unknown> {
  return parse(await fetch(`${GRAPH_BASE}/me/subscribed_apps`, { headers: bearer(token) }));
}

export interface MediaItem {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  shortcode?: string;
  timestamp?: string;
}

export async function listRecentMedia(token: string): Promise<MediaItem[]> {
  const fields = "id,caption,media_type,media_product_type,permalink,shortcode,timestamp";
  const res = await parse<{ data: MediaItem[] }>(await fetch(`${GRAPH_BASE}/me/media?fields=${fields}&limit=30`, { headers: bearer(token) }));
  return res.data ?? [];
}

/** The only message the automation can send: one private reply to one comment. */
export async function sendPrivateReply(token: string, igUserId: string, commentId: string, text: string): Promise<{ recipient_id?: string; message_id?: string }> {
  return parse(
    await fetch(`${GRAPH_BASE}/${encodeURIComponent(igUserId)}/messages`, {
      method: "POST",
      headers: { ...bearer(token), "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
    }),
  );
}

export interface ApiComment {
  id: string;
  text?: string;
  timestamp?: string;
  username?: string;
  from?: { id?: string; username?: string };
  parent_id?: string;
}

/** Read-only: comments on one of the connected account's own media, straight from the API (no webhook involved). */
export async function listComments(token: string, mediaId: string): Promise<ApiComment[]> {
  const fields = "id,text,timestamp,username,from,parent_id";
  const res = await parse<{ data: ApiComment[] }>(
    await fetch(`${GRAPH_BASE}/${encodeURIComponent(mediaId)}/comments?fields=${fields}&limit=50`, { headers: bearer(token) }),
  );
  return res.data ?? [];
}

export async function getMedia(token: string, mediaId: string): Promise<{ id: string; permalink?: string; media_product_type?: string; comments_count?: number; timestamp?: string }> {
  return parse(
    await fetch(`${GRAPH_BASE}/${encodeURIComponent(mediaId)}?fields=id,permalink,media_product_type,comments_count,timestamp`, { headers: bearer(token) }),
  );
}
