import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAdminFromCookie } from "@/lib/admin/session";
import { getAppBaseUrl } from "@/lib/config/appBaseUrl";
import { getAllowedUsername } from "@/lib/instagram/config";
import { GraphError, exchangeCode, getMe, subscribeToComments } from "@/lib/instagram/graph";
import { FieldValue, Timestamp, encryptToken, stateRef } from "@/lib/instagram/store";

export const runtime = "nodejs";

const STATE_COOKIE = "__junto_ig_state";

function back(result: string) {
  const res = NextResponse.redirect(`${getAppBaseUrl()}/admin/instagram?result=${encodeURIComponent(result)}`);
  res.cookies.set(STATE_COOKIE, "", { path: "/api/admin/instagram", maxAge: 0 });
  return res;
}

/**
 * Instagram Login return. Refuses any account other than the configured
 * one: its token is never stored. On success, subscribes the account to
 * comment notifications for this app (a setting on our app's side, not in
 * the Instagram account's settings). Connecting never activates sending.
 */
export async function GET(request: Request) {
  const admin = await requireAdminFromCookie().catch(() => null);
  if (!admin) return back("not_signed_in");

  const params = new URL(request.url).searchParams;
  if (params.get("error")) return back(`instagram_${params.get("error_reason") ?? params.get("error")}`);
  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  if (!expectedState || params.get("state") !== expectedState) return back("state_mismatch");
  const code = params.get("code")?.replace(/#_$/, "");
  if (!code) return back("missing_code");

  try {
    const token = await exchangeCode(code);
    const me = await getMe(token.accessToken);
    if (me.username?.toLowerCase() !== getAllowedUsername()) return back(`wrong_account_${me.username ?? "unknown"}`);

    let subscribed = false;
    let subscribeError: string | null = null;
    try {
      const sub = await subscribeToComments(token.accessToken);
      subscribed = sub.success === true;
    } catch (error) {
      subscribeError = error instanceof GraphError ? `${error.message} (code ${error.code ?? error.status})` : String(error);
    }

    const snap = await stateRef.get();
    const status = snap.data()?.status;
    await stateRef.set(
      {
        igUserId: String(me.user_id ?? me.id),
        oauthUserId: token.userId || String(me.id),
        username: me.username,
        accountType: me.account_type ?? null,
        permissions: token.permissions,
        token: encryptToken(token.accessToken),
        tokenExpiresAt: Timestamp.fromMillis(Date.now() + token.expiresInSeconds * 1000),
        connectedAt: FieldValue.serverTimestamp(),
        connectedBy: admin.email,
        subscribed,
        subscribeError,
        // A (re)connection never turns sending on.
        status: status === "active" ? "paused" : (status ?? "paused"),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return back(subscribed ? "connected" : "connected_not_subscribed");
  } catch (error) {
    const g = error instanceof GraphError ? error : null;
    console.error("instagram callback: failed", g ? `${g.code} ${g.message}` : (error as Error)?.message);
    return back(`failed_${g?.code ?? g?.status ?? "unknown"}`);
  }
}
