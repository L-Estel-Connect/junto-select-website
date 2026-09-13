import { NextResponse } from "next/server";
import { isAuthorizedAdminRequest } from "@/lib/matching/adminAuth";
import { runDueMatchingScan } from "@/lib/matching/dueScheduler";
import { recordMatchingScan } from "@/lib/admin/matchingScans";

export const runtime = "nodejs";

/**
 * The scheduler-facing entry point for the automatic matching scheduler —
 * this is the ONE place automatic matching gets triggered from. Each
 * member's matching cycle is anchored to THEIR OWN paid-membership start
 * date (see `matchingAnchorAt`/`matchingPeriodsProcessed`/
 * `nextMatchingDueAt` on ProfileDocument, set by the Stripe webhook and
 * advanced by `runDueMatchingScan`) — deliberately NOT a shared calendar-
 * month cycle. There is no "1st of the month" concept anywhere in this
 * path; see README "Automatic matching scheduling" for the full model and
 * why an earlier calendar-month design was replaced with this one before
 * ever being scheduled in production.
 *
 * Authenticated the same way every other /api/admin/matching/* route is
 * (MATCHING_ADMIN_SECRET) — no new IAM/infra needed to call it. Safe to
 * call as often as you like: `runDueMatchingScan` is idempotent per
 * member-period (see its own docs) and bounded per call, so overlapping
 * or retried invocations never double-process anyone or lose anyone.
 */
export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDueMatchingScan();
    // Best-effort observability write — a failure here must never make an
    // otherwise-successful scan report as failed to the caller/Scheduler.
    await recordMatchingScan(result).catch((error) => {
      console.error("Failed to record matching scan summary", error);
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Due matching scan failed", error);
    return NextResponse.json({ ok: false, error: "scan_failed" }, { status: 500 });
  }
}
