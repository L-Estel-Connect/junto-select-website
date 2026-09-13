import { NextResponse } from "next/server";
import {
  ADMIN_TOKEN_COOKIE,
  ADMIN_TOKEN_COOKIE_MAX_AGE_SECONDS,
  verifyAdminToken,
} from "@/lib/admin/session";

export const runtime = "nodejs";

/**
 * Mints the admin page-load cookie from a Firebase ID token — but only
 * after that token passes the exact same `verifyAdminToken` check every
 * other admin surface uses (valid, non-revoked Firebase user + verified
 * email + on the server-side allowlist). A non-admin who signs in on
 * /admin/login gets a 403 here and no cookie is ever set; nothing about
 * this endpoint trusts the client's claim of who they are.
 */
export async function POST(request: Request) {
  let body: { idToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.idToken) {
    return NextResponse.json({ ok: false, error: "idToken_required" }, { status: 400 });
  }

  try {
    const admin = await verifyAdminToken(body.idToken);
    const response = NextResponse.json({ ok: true, email: admin.email });
    response.cookies.set(ADMIN_TOKEN_COOKIE, body.idToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      // NOT "/admin": that would only ever be sent back on requests whose
      // path itself starts with "/admin" per RFC 6265 path-matching, which
      // "/api/admin/dashboard/photo" (path-authenticated by this exact
      // cookie — see that route) does NOT, since "/api" and "/admin" are
      // different top-level segments. A prior version scoped this cookie
      // to "/admin" and the photo route silently, unconditionally 401'd
      // for every real admin because of it — proven with a real browser,
      // not just by reading the spec: the cookie was simply never
      // attached to that request. "/" is the narrowest path that actually
      // covers both real consumers (the /admin/** page-load layout check,
      // and this one API route under /api/admin/**), since they share no
      // common non-root path prefix.
      path: "/",
      maxAge: ADMIN_TOKEN_COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  } catch {
    // Deliberately generic — never confirm/deny whether an email exists or
    // is close to the allowlist.
    return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 403 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    // Must match the Path the cookie was actually SET with (see POST
    // above) — a clearing Set-Cookie only clears a cookie whose Path
    // attribute matches exactly; a mismatched Path here would silently
    // leave the real cookie in place while appearing to log out.
    path: "/",
    maxAge: 0,
  });
  return response;
}
