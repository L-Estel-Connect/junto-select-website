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
      path: "/admin",
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
    path: "/admin",
    maxAge: 0,
  });
  return response;
}
