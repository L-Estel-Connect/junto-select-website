import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { describeError } from "@/lib/admin/describeError";
import { syncEligibleEvent } from "@/lib/eventBenefits/eligibleEvents";

export const runtime = "nodejs";

/**
 * "Sync member discounts to this event" — the V1, admin-triggered,
 * explicit alternative to a Ticket Tailor event.created webhook (see the
 * implementation report for why this launch-simplicity choice was made
 * over a webhook-driven design). Idempotent and safe to click again: see
 * syncEligibleEvent's own doc comment.
 */
export async function POST(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  let body: { ticketTailorEventId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.ticketTailorEventId !== "string" || !body.ticketTailorEventId.trim()) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  try {
    const result = await syncEligibleEvent(body.ticketTailorEventId.trim());
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof Error && error.message === "eligible_event_not_found") {
      return NextResponse.json({ ok: false, error: "eligible_event_not_found" }, { status: 404 });
    }
    console.error("sync-event: failed", error);
    return NextResponse.json({ ok: false, error: "sync_failed", detail: describeError(error) }, { status: 500 });
  }
}
