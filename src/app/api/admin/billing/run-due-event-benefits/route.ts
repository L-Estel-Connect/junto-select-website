import { NextResponse } from "next/server";
import { isAuthorizedAdminRequest } from "@/lib/matching/adminAuth";
import { runDueEventBenefitScan } from "@/lib/eventBenefits/lifecycle";

export const runtime = "nodejs";

/**
 * The scheduler-facing entry point for the monthly Ticket Tailor event
 * benefit — the event-benefit counterpart to
 * /api/admin/matching/run-due-cycle, same shared-secret auth (this is an
 * unattended automation endpoint, not a human clicking a button), and the
 * same "safe to call as often as you like" property: runDueEventBenefitScan
 * is idempotent per subscription-cycle and bounded per call (see its own
 * doc comment for the full idempotency/external-side-effect strategy).
 *
 * Not yet wired to a real Cloud Scheduler job — see the implementation
 * report's manual-configuration section.
 */
export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDueEventBenefitScan();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Due event-benefit scan failed", error);
    return NextResponse.json({ ok: false, error: "scan_failed" }, { status: 500 });
  }
}
