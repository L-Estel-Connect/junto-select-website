import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { describeError } from "@/lib/admin/describeError";
import { adminDb } from "@/lib/firebase/admin";
import { reconcileEventBenefitsForEvent } from "@/lib/eventBenefits/lifecycle";
import { recordEventBenefitSyncResult } from "@/lib/eventBenefits/eligibleEvents";
import type { EligibleTicketTailorEventDocument } from "@/lib/eventBenefits/types";

export const runtime = "nodejs";

/**
 * "Sincronizar" — an optional, immediate, per-event reconciliation, never
 * a required operational step (the scheduler already does this
 * automatically for every eligible upcoming event — see
 * runDueEventBenefitScan). Useful right after registering/editing an
 * event, when Lara wants currently-entitled members granted their benefit
 * without waiting for the next scheduled pass. Idempotent and safe to
 * click repeatedly: reconcileEventBenefitsForEvent only ever creates a
 * missing (member, event) pair, never re-touches an already-settled one.
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
    const event = eventSnap.data() as EligibleTicketTailorEventDocument;
    const result = await reconcileEventBenefitsForEvent(event);
    await recordEventBenefitSyncResult(ticketTailorEventId, result);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("sync-event: failed", error);
    return NextResponse.json({ ok: false, error: "sync_failed", detail: describeError(error) }, { status: 500 });
  }
}
