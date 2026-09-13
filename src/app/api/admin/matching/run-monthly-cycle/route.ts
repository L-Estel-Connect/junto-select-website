import { NextResponse } from "next/server";
import { isAuthorizedAdminRequest } from "@/lib/matching/adminAuth";
import { runMatchingCycle } from "@/lib/matching/engine";
import { monthlyProductionCycleId } from "@/lib/matching/config";

export const runtime = "nodejs";

/**
 * The Cloud-Scheduler-facing entry point for the automatic monthly
 * matching cycle — the piece that did not exist before the October 2026
 * operational audit (see README "Monthly matching engine"). Deliberately
 * a thin wrapper around the existing, already-tested `runMatchingCycle`
 * rather than new orchestration logic:
 *
 * - The cycleId is derived purely from the current Europe/Madrid calendar
 *   month (`monthlyProductionCycleId`), NEVER from any member's Stripe
 *   billing/renewal date — this is what keeps the matching cycle and
 *   billing renewal completely independent, as required.
 * - Calling this endpoint more than once within the same Madrid calendar
 *   month (a Scheduler retry, or someone triggering it by hand) resolves
 *   to the SAME cycleId, and `runMatchingCycle` already treats a
 *   `completed` cycle as a pure no-op and a partially-run one as safely
 *   resumable — so this can never create a second monthly allowance for
 *   the same member, whatever calls it or how many times.
 * - `mode: "production"` is what makes `selectRecipients` (engine.ts)
 *   process the FULL eligible active_search population rather than a
 *   capped slice, looping across however many invocations it takes
 *   within engine.ts's own time-budget guard.
 *
 * Authenticated the same way every other /api/admin/matching/* route
 * already is (MATCHING_ADMIN_SECRET) — this is a deliberate choice to
 * require ZERO new infrastructure/IAM setup: Cloud Scheduler's HTTP
 * target can send this exact header, sourced from the same Secret
 * Manager secret already used for the other matching admin routes. See
 * the operational audit report for the exact `gcloud scheduler jobs
 * create` command and an OIDC-based alternative if a shared header secret
 * in the Scheduler job config is not an acceptable tradeoff.
 */
export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const cycleId = monthlyProductionCycleId(new Date());

  try {
    const cycle = await runMatchingCycle(cycleId, "production", {});
    return NextResponse.json({ ok: true, cycleId, cycle });
  } catch (error) {
    console.error(`Monthly matching cycle ${cycleId} failed`, error);
    return NextResponse.json(
      { ok: false, error: "cycle_run_failed", cycleId },
      { status: 500 },
    );
  }
}
