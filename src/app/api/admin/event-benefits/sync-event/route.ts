import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { describeError } from "@/lib/admin/describeError";
import { adminDb } from "@/lib/firebase/admin";
import { retryPendingEventBenefits } from "@/lib/eventBenefits/lifecycle";
import { recordEventBenefitSyncResult } from "@/lib/eventBenefits/eligibleEvents";

export const runtime = "nodejs";

/**
 * "Sincronizar" — retries, for this one event, any member code whose
 * Ticket Tailor discount isn't live yet (the scheduled scan does the same
 * for every event). Under the monthly-cycle model it never issues codes:
 * members request their one code per cycle themselves. Idempotent and safe
 * to click repeatedly.
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
  const ticketTailorEventId = body.ticketTailorEventId.trim();

  try {
    const eventSnap = await adminDb.doc(`eligibleTicketTailorEvents/${ticketTailorEventId}`).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ ok: false, error: "eligible_event_not_found" }, { status: 404 });
    }
    const result = await retryPendingEventBenefits(ticketTailorEventId);
    await recordEventBenefitSyncResult(ticketTailorEventId, result);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("sync-event: failed", error);
    return NextResponse.json({ ok: false, error: "sync_failed", detail: describeError(error) }, { status: 500 });
  }
}
