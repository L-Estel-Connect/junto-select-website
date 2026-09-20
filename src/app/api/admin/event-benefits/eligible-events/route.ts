import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { listEligibleEvents, registerEligibleEvent } from "@/lib/eventBenefits/eligibleEvents";

export const runtime = "nodejs";

/**
 * Admin-only registry of which Ticket Tailor events/ticket types
 * participate in the Junto Select member benefit — see the Ticket Tailor
 * API audit for why this is Junto's own explicit record rather than any
 * Ticket Tailor-side tag/category (no such supported mechanism exists).
 * Authorized via the admin Firebase session, like every other
 * /api/admin/dashboard/* route — a human in the admin UI, not an
 * unattended script.
 */
export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const events = await listEligibleEvents();
  return NextResponse.json({ ok: true, events });
}

export async function POST(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  let body: { ticketTailorEventId?: unknown; ticketTailorTicketTypeIds?: unknown; label?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { ticketTailorEventId, ticketTailorTicketTypeIds, label } = body;
  if (
    typeof ticketTailorEventId !== "string" ||
    !ticketTailorEventId.trim() ||
    typeof label !== "string" ||
    !label.trim() ||
    !Array.isArray(ticketTailorTicketTypeIds) ||
    ticketTailorTicketTypeIds.length === 0 ||
    !ticketTailorTicketTypeIds.every((id) => typeof id === "string" && id.trim())
  ) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  await registerEligibleEvent({
    ticketTailorEventId: ticketTailorEventId.trim(),
    ticketTailorTicketTypeIds: ticketTailorTicketTypeIds.map((id) => id.trim()),
    label: label.trim(),
  });

  return NextResponse.json({ ok: true });
}
