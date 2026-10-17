import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminFromCookie } from "@/lib/admin/session";
import { getAppBaseUrl } from "@/lib/config/appBaseUrl";
import { instagramTestEnabled } from "@/lib/instagramTest/config";
import { authorizeUrl } from "@/lib/instagramTest/graph";

export const runtime = "nodejs";

const STATE_COOKIE = "__junto_ig_test_state";

/** Starts Instagram Login. A browser navigation, so the admin page-load cookie is the gate here. */
export async function GET() {
  if (!instagramTestEnabled()) return new NextResponse(null, { status: 404 });
  const admin = await requireAdminFromCookie().catch(() => null);
  if (!admin) return NextResponse.redirect(`${getAppBaseUrl()}/admin/login`);

  const state = randomBytes(24).toString("hex");
  let url: string;
  try {
    url = authorizeUrl(state);
  } catch (error) {
    return NextResponse.json({ ok: false, error: "not_configured", detail: (error as Error).message }, { status: 503 });
  }
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/admin/instagram-test", maxAge: 600 });
  return res;
}
