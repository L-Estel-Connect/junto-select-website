import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { describeError } from "@/lib/admin/describeError";
import { setReconnectForceClosed } from "@/lib/eventReconnect/eventConfig";

export const runtime = "nodejs";

/**
 * The one manual safety override the audit called for — independent of the
 * computed 48h window, so Lara can immediately shut down discovery for an
 * event (an incident, a complaint) without waiting it out or un-registering
 * the event. Toggle both ways: force-closing and clearing the override are
 * both deliberate, explicit admin actions.
 */
export async function POST(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  let body: { ticketTailorEventId?: unknown; forceClosed?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.ticketTailorEventId !== "string" || !body.ticketTailorEventId.trim() || typeof body.forceClosed !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  try {
    await setReconnectForceClosed(body.ticketTailorEventId.trim(), body.forceClosed);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("event-reconnect force-close: failed", error);
    return NextResponse.json({ ok: false, error: "failed_to_update_force_close", detail: describeError(error) }, { status: 500 });
  }
}
