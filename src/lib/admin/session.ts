import "server-only";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";

/**
 * Admin Dashboard authorization — completely separate from the
 * shared-secret `isAuthorizedAdminRequest` in src/lib/matching/adminAuth.ts
 * (that one gates unattended automation routes, e.g. a future scheduler;
 * there is no human at a keyboard on the other end of those calls). This
 * one gates a HUMAN using a browser, so it verifies a real Firebase
 * identity server-side on every single request — never a client-side
 * email check, never trust in a URL being obscure.
 *
 * The allowlist is server-side config, not a build-time constant, so it
 * can be changed (e.g. a second admin added later) without a code change —
 * see README. It intentionally defaults to exactly one address if the env
 * var is unset, rather than defaulting to "allow everyone" or failing
 * open in any way.
 */
function getAdminAllowlist(): string[] {
  const raw = process.env.ADMIN_ALLOWLIST_EMAILS?.trim();
  const list = raw
    ? raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
    : ["lara.dewavrin@gmail.com"];
  return list;
}

export function isAllowlistedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminAllowlist().includes(email.trim().toLowerCase());
}

export class AdminAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAuthError";
  }
}

export interface AdminIdentity {
  uid: string;
  email: string;
}

/**
 * Verifies a Firebase ID token belongs to a real, currently-valid Firebase
 * user (`checkRevoked: true` — a revoked/disabled account fails here even
 * with an otherwise-unexpired token) AND that its (Firebase-verified,
 * `email_verified`) email is on the server-side allowlist. This is the ONE
 * function every admin page and every admin API route ultimately calls —
 * there is no other path to "authorized".
 */
export async function verifyAdminToken(idToken: string): Promise<AdminIdentity> {
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken, true);
  } catch {
    throw new AdminAuthError("invalid_token");
  }
  if (!decoded.email || !decoded.email_verified) {
    throw new AdminAuthError("email_not_verified");
  }
  if (!isAllowlistedAdminEmail(decoded.email)) {
    throw new AdminAuthError("not_allowlisted");
  }
  return { uid: decoded.uid, email: decoded.email.toLowerCase() };
}

/**
 * Used by every /api/admin/dashboard/* route. The client always sends a
 * fresh ID token as a Bearer header (see adminFetch.ts) rather than relying
 * on the page-load cookie below, so an API call is authorized independently
 * of whether the page itself was ever properly loaded.
 */
export async function requireAdminFromAuthHeader(request: Request): Promise<AdminIdentity> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) throw new AdminAuthError("missing_token");
  return verifyAdminToken(match[1]);
}

/**
 * The cookie name used to gate initial page loads (see
 * src/app/admin/(dashboard)/layout.tsx) — holds a short-lived raw Firebase
 * ID token (NOT a Firestore session or anything bespoke), httpOnly +
 * Secure + SameSite=Lax, Path=/ (see /api/admin/session's own comment for
 * why it's "/" and not "/admin" — it has to cover both the /admin/** page
 * layout AND /api/admin/dashboard/photo, which share no path prefix other
 * than the root). Storing the ID token itself
 * (rather than inventing a session mechanism) means page loads and API
 * calls are authorized through the identical verifyAdminToken check above —
 * one rule, enforced the same way everywhere, never a second, looser one
 * for pages. AdminShell refreshes this cookie in the background every ~45
 * minutes so a long dashboard session doesn't require re-login mid-use;
 * the underlying ID token still expires (and is still re-verified,
 * including revocation) on every request regardless.
 */
export const ADMIN_TOKEN_COOKIE = "__junto_admin_token";
export const ADMIN_TOKEN_COOKIE_MAX_AGE_SECONDS = 55 * 60;

/**
 * Used only by the Server Component layout at src/app/admin/(dashboard)/
 * layout.tsx — reads the cookie above and runs it through the identical
 * verifyAdminToken check. If this throws (missing cookie, expired token,
 * revoked account, email no longer allowlisted), the layout redirects to
 * /admin/login BEFORE rendering any child route — no dashboard markup, and
 * therefore no dashboard data, is ever produced for an unauthorized
 * request. Every dashboard page also fetches its actual data client-side
 * through /api/admin/dashboard/* (independently re-checked via
 * requireAdminFromAuthHeader), so this cookie check is a genuine gate, not
 * decoration in front of data that would load anyway.
 */
export async function requireAdminFromCookie(): Promise<AdminIdentity> {
  const store = await cookies();
  const token = store.get(ADMIN_TOKEN_COOKIE)?.value;
  if (!token) throw new AdminAuthError("missing_token");
  return verifyAdminToken(token);
}
