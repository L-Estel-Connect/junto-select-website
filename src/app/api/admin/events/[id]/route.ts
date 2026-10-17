import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { getEventForAdmin, saveEvent } from "@/lib/events/manager";
import { parseTicketTailorEventRef } from "@/lib/events/editing";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await context.params;
  const event = await getEventForAdmin(id);
  if (!event) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, event });
}

/** Saves the edit form. A `ticketTailorRef` on a manual event links it to Ticket Tailor (its id becomes the Ticket Tailor number). */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await context.params;
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
  const result = await saveEvent(id, ttId, body);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: `${result.error}: ${result.message}` }, { status: result.error === "not_found" ? 404 : 400 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}
