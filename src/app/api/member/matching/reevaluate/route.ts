import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { runDueMatchingForUid } from "@/lib/matching/dueScheduler";

export const runtime = "nodejs";

/**
 * Lets a signed-in member ask for their OWN matching eligibility to be
 * re-evaluated now (called right after they finalize their Introductions
 * profile), instead of waiting for the next scheduled due scan. Everything
 * is decided server-side from stored data: the caller can only target
 * their own uid, and nothing happens unless they are paying, their period
 * is due and their profile is eligible. Idempotent: the period's cycle id
 * is deterministic, so calling this repeatedly never creates extra
 * proposals.
 */
export async function POST(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await runDueMatchingForUid(auth.uid);
    return NextResponse.json({
      ok: true,
      advanced: result.membersAdvanced > 0,
      paused: result.membersIneligible > 0,
    });
  } catch (error) {
    console.error("Matching reevaluation failed", error);
    return NextResponse.json({ ok: false, error: "reevaluation_failed" }, { status: 500 });
  }
}
