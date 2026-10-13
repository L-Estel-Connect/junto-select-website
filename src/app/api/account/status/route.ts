import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { isAllowlistedAdminEmail } from "@/lib/admin/session";
import { decideAccountRoute } from "@/lib/account/route";
import { loadAccountState } from "@/lib/account/server";

export const runtime = "nodejs";

/**
 * "Acceder" for a signed-in person: where to go next, read-only. Never
 * creates a profile (see decideAccountRoute); `route: null` means the
 * "Tu cuenta" page, where the person chooses.
 */
export async function GET(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  const { profile, entitled } = await loadAccountState(auth.uid);
  return NextResponse.json({
    ok: true,
    route: decideAccountRoute({ profile, entitled }),
    hasProfile: !!profile,
    entitled,
    admin: isAllowlistedAdminEmail(auth.email),
  });
}
