import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { claimCycleEventBenefit, getMemberEventBenefitState } from "@/lib/eventBenefits/lifecycle";

export const runtime = "nodejs";

/**
 * The member's own 20 % benefit ONLY: their current monthly cycle, the
 * events this cycle's code can be requested for, and the codes they hold.
 * Never another member's record (everything is uid-scoped server-side,
 * and Firestore rules independently enforce the same boundary).
 * Invalidated codes are filtered out — the member never sees a dead code.
 */
export async function GET(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  const state = await getMemberEventBenefitState(auth.uid);
  return NextResponse.json({ ok: true, ...state });
}

/**
 * Requests this cycle's single code for one event. All rules (one per
 * monthly cycle, entitlement, the event's eligibility and date) are
 * enforced in claimCycleEventBenefit; repeating the same request returns
 * the same code.
 */
export async function POST(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  let body: { ticketTailorEventId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const eventId = typeof body.ticketTailorEventId === "string" ? body.ticketTailorEventId.trim() : "";
  if (!eventId || eventId.includes("/")) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const result = await claimCycleEventBenefit(auth.uid, eventId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true, benefit: result.benefit });
}
