import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { activateLegacyProfile } from "@/lib/legacyImport/claim";

export const runtime = "nodejs";

/**
 * The trusted server-side "clear pendingLegacyActivation" action — see
 * claim.ts's `activateLegacyProfile` for the three independently
 * re-verified conditions (claimed by this uid, CURRENT legal versions
 * accepted, onboarding genuinely complete). Same no-client-supplied-email
 * contract as /api/legacy/claim and /api/legacy/accept-terms.
 */
export async function POST(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  const { uid, email } = auth;

  if (!email) {
    return NextResponse.json({ ok: false, error: "no_verified_email" }, { status: 400 });
  }

  const result = await activateLegacyProfile(uid, email);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "not_claimed_by_you" ? 403 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
