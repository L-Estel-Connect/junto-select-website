import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getCurrentEventBenefitForMember } from "@/lib/eventBenefits/lifecycle";

export const runtime = "nodejs";

/**
 * The member's own CURRENT event benefit only — never the full
 * eventBenefits history (that's server/admin/audit-only), never another
 * member's record (query is uid-scoped server-side, and Firestore rules
 * independently enforce the same boundary for defense in depth). Returns
 * `benefit: null` both when the member isn't entitled at all and when
 * they're entitled but the monthly grant hasn't finished syncing yet —
 * the client (PlanSection.tsx) already knows from `useBilling` whether
 * the member is entitled, so it can tell those two cases apart on its own
 * without this route needing to duplicate that logic.
 */
export async function GET(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  const benefit = await getCurrentEventBenefitForMember(auth.uid);
  return NextResponse.json({ ok: true, benefit });
}
