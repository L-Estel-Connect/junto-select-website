import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { parseTicketTailorEventRef } from "@/lib/events/editing";
import { importTicketTailorEvent } from "@/lib/events/ticketTailorImport";

export const runtime = "nodejs";

const MESSAGES = {
  not_found: "Ticket Tailor no encuentra ese evento. Revisa el enlace.",
  not_configured: "La conexión con Ticket Tailor no está configurada aquí. Puedes rellenar los datos a mano.",
  request_failed: "Ticket Tailor no ha respondido. Puedes rellenar los datos a mano o intentarlo más tarde.",
};

/**
 * Reads an event from Ticket Tailor to pre-fill the form (read-only: nothing
 * is created or changed in Ticket Tailor, and nothing is saved here).
 * Body: { ref: a pasted Ticket Tailor link or event number }.
 */
export async function POST(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const body = (await request.json().catch(() => ({}))) as { ref?: unknown };
  const refText = typeof body.ref === "string" ? body.ref.trim() : "";
  const id = parseTicketTailorEventRef(refText);
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "invalid_ref: Pega el enlace del evento en Ticket Tailor (por ejemplo https://www.tickettailor.com/events/juntoselect/2439069) o su número." },
      { status: 400 },
    );
  }
  const pastedUrl = /^https:\/\//.test(refText) ? refText : null;
  const result = await importTicketTailorEvent(id, pastedUrl);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: `${result.error}: ${MESSAGES[result.error]}`, ticketTailorEventId: id }, { status: result.error === "not_found" ? 404 : 502 });
  }
  return NextResponse.json({ ok: true, import: result.value });
}
