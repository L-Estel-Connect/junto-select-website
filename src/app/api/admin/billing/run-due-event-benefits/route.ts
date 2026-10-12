import { NextResponse } from "next/server";
import { isAuthorizedAdminRequest } from "@/lib/matching/adminAuth";
import { runDueEventBenefitScan } from "@/lib/eventBenefits/lifecycle";

export const runtime = "nodejs";

/**
 * The scheduler-facing entry point for the 20 % member benefit — same
 * shared-secret auth as /api/admin/matching/run-due-cycle. Under the
 * monthly-cycle model it only retries codes whose Ticket Tailor discount
 * isn't live yet (members request their one code per cycle themselves),
 * so it is safe to call as often as you like.
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
