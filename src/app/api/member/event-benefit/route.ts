import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { listEventBenefitsForMember } from "@/lib/eventBenefits/lifecycle";

export const runtime = "nodejs";

/**
 * The member's own event benefits ONLY — every benefit is one (member,
 * eligible event) pair; a member with several currently-covered events
 * gets several entries. Never another member's record (the query is
 * uid-scoped server-side, and Firestore rules independently enforce the
 * same boundary for defense in depth). Invalidated benefits are filtered
 * out before this ever returns (see listEventBenefitsForMember) — the
 * member never sees a dead code.
 */
export async function GET(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  const benefits = await listEventBenefitsForMember(auth.uid);
  return NextResponse.json({ ok: true, benefits });
}
