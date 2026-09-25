import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { importEventParticipants, type ImportEventParticipantRow } from "@/lib/eventReconnect/participants";

export const runtime = "nodejs";

/**
 * V1 import path: Lara exports attendee/order data from Ticket Tailor's
 * own dashboard (CSV) and the admin UI turns that into this small JSON
 * array — see participants.ts's doc comment for why this deliberately
 * does NOT pull from a live Ticket Tailor attendee-list API (no such
 * endpoint has been verified against this codebase's Ticket Tailor
 * integration; only /v1/discounts has). Safe to re-run on a corrected
 * export: already-imported rows are left untouched (see
 * importEventParticipants).
 */
export async function POST(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  let body: { eventId?: unknown; rows?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.eventId !== "string" || !body.eventId.trim() || !Array.isArray(body.rows)) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const rows: ImportEventParticipantRow[] = [];
  for (const raw of body.rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.email !== "string" || !r.email.trim()) continue;
    rows.push({
      email: r.email,
      firstName: typeof r.firstName === "string" ? r.firstName : null,
      lastName: typeof r.lastName === "string" ? r.lastName : null,
      phone: typeof r.phone === "string" ? r.phone : null,
      ticketTailorOrderId: typeof r.ticketTailorOrderId === "string" ? r.ticketTailorOrderId : null,
    });
  }

  const result = await importEventParticipants(body.eventId.trim(), rows);
  return NextResponse.json({ ok: true, result });
}
