import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { describeError } from "@/lib/admin/describeError";
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
 *
 * GET/POST bodies are wrapped so every path — success, validation
 * rejection, or an unexpected failure reading/writing Firestore — always
 * returns valid JSON with an appropriate status. Before this, an uncaught
 * exception here (e.g. a transient Firestore error) produced an empty
 * response body, which the admin UI's `res.json()` call then failed to
 * parse with a raw, undiagnosable browser error ("Unexpected end of JSON
 * input") instead of a real message.
 *
 * The caught error's own message/code is included in the JSON response
 * (`detail`) as well as logged server-side — this route has no access to
 * this deployment's Cloud Logging from where it's developed, so the
 * response body itself is the only available diagnostic channel for a
 * failure that only reproduces against the real deployed backend (e.g. a
 * genuine Firestore IAM/permission or provisioning issue that an emulator
 * can't reproduce at all, since the emulator enforces no IAM). Safe here:
 * this route is already admin-authenticated, and a Firestore error message
 * never contains secrets — at most a project id or resource path.
 */
export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const events = await listEligibleEvents();
    return NextResponse.json({ ok: true, events });
  } catch (error) {
    console.error("eligible-events GET: failed", error);
    return NextResponse.json({ ok: false, error: "failed_to_list_events", detail: describeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  let body: {
    ticketTailorEventId?: unknown;
    ticketTailorTicketTypeIds?: unknown;
    label?: unknown;
    eventDate?: unknown;
    reconnectEnabled?: unknown;
    memberBenefitEnabled?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { ticketTailorEventId, ticketTailorTicketTypeIds, label, eventDate, reconnectEnabled, memberBenefitEnabled } = body;

  // The 20% member benefit and Reconnect are fully independent switches on
  // the same event — see the product clarification: an event can have
  // either, both, or neither. Ticket type IDs are what the 20% benefit
  // needs (they scope which tickets a member's discount code applies to);
  // Reconnect needs none of that, so they're only REQUIRED when the
  // benefit toggle is on, never just to enable Reconnect. Missing the
  // toggle entirely defaults to `true` here (not in the library function),
  // preserving the pre-existing behavior for any caller that predates this
  // field: "register with ticket types" used to always mean "benefit on."
  const effectiveMemberBenefitEnabled = typeof memberBenefitEnabled === "boolean" ? memberBenefitEnabled : true;
  const ticketTypeIdsArray = Array.isArray(ticketTailorTicketTypeIds) ? ticketTailorTicketTypeIds : [];
  const ticketTypeIdsAreValidStrings = ticketTypeIdsArray.every((id) => typeof id === "string" && id.trim());

  if (
    typeof ticketTailorEventId !== "string" ||
    !ticketTailorEventId.trim() ||
    typeof label !== "string" ||
    !label.trim() ||
    !Array.isArray(ticketTailorTicketTypeIds) ||
    !ticketTypeIdsAreValidStrings ||
    (effectiveMemberBenefitEnabled && ticketTypeIdsArray.length === 0) ||
    (eventDate !== undefined && eventDate !== null && (typeof eventDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate))) ||
    (reconnectEnabled !== undefined && typeof reconnectEnabled !== "boolean") ||
    (memberBenefitEnabled !== undefined && typeof memberBenefitEnabled !== "boolean")
  ) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  try {
    await registerEligibleEvent({
      ticketTailorEventId: ticketTailorEventId.trim(),
      ticketTailorTicketTypeIds: ticketTypeIdsArray.map((id) => id.trim()),
      label: label.trim(),
      eventDate: (eventDate as string | undefined) ?? null,
      reconnectEnabled: (reconnectEnabled as boolean | undefined) ?? false,
      memberBenefitEnabled: effectiveMemberBenefitEnabled,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("eligible-events POST: failed to register event", error);
    return NextResponse.json(
      { ok: false, error: "failed_to_register_event", detail: describeError(error) },
      { status: 500 },
    );
  }
}
