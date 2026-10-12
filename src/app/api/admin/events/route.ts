import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { describeError } from "@/lib/admin/describeError";
import { listEligibleEvents } from "@/lib/eventBenefits/eligibleEvents";
import { countEventBenefitsForEvent } from "@/lib/eventBenefits/lifecycle";
import { saveEvent } from "@/lib/events/manager";
import { parseTicketTailorEventRef } from "@/lib/events/editing";
import type { EligibleTicketTailorEventDocument } from "@/lib/eventBenefits/types";

export const runtime = "nodejs";

export interface AdminEventRow extends EligibleTicketTailorEventDocument {
  /** Member 20 % codes issued for this event. */
  benefitCount: number;
}

/** Every event (archived included), soonest first, for the admin Events Manager. */
export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const events = await listEligibleEvents();
    const rows: AdminEventRow[] = await Promise.all(
      events.map(async (e) => ({ ...e, benefitCount: await countEventBenefitsForEvent(e.ticketTailorEventId) })),
    );
    rows.sort((a, b) => (a.eventDate ?? "9999").localeCompare(b.eventDate ?? "9999"));
    return NextResponse.json({ ok: true, events: rows });
  } catch (error) {
    console.error("admin events GET failed", error);
    return NextResponse.json({ ok: false, error: "failed_to_list_events", detail: describeError(error) }, { status: 500 });
  }
}

/** Creates an event. Body: the form fields, plus `ticketTailorRef` (a pasted link or number) when there is one. */
export async function POST(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const refText = typeof body.ticketTailorRef === "string" ? body.ticketTailorRef : "";
  const ttId = refText.trim() ? parseTicketTailorEventRef(refText) : null;
  if (refText.trim() && !ttId) {
    return NextResponse.json({ ok: false, error: "invalid: El enlace de Ticket Tailor no es válido." }, { status: 400 });
  }
  const result = await saveEvent(null, ttId, body);
  if (!result.ok) return NextResponse.json({ ok: false, error: `${result.error}: ${result.message}` }, { status: 400 });
  return NextResponse.json({ ok: true, id: result.id });
}
