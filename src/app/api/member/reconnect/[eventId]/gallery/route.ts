import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getEligibleEvent, reconnectWindowState } from "@/lib/eventReconnect/eventConfig";
import { eventParticipantId, normalizeEmail } from "@/lib/eventReconnect/identifiers";
import { findEventParticipantByEmail } from "@/lib/eventReconnect/participants";
import { listReconnectGallery } from "@/lib/eventReconnect/discovery";

export const runtime = "nodejs";

/**
 * The visual recall fallback — same access checks as search (genuine,
 * activated participant of THIS event, discovery currently open), same
 * server-side-only data path. Every returned item is name + one photo
 * only, by construction (ReconnectCandidateView has no other fields) — see
 * the audit for why this is deliberately not a richer "profile card."
 */
export async function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.email) return NextResponse.json({ ok: false, error: "no_email" }, { status: 400 });

  const { eventId } = await context.params;
  const event = await getEligibleEvent(eventId);
  if (!event || reconnectWindowState(event) !== "open") {
    return NextResponse.json({ ok: false, error: "discovery_closed" }, { status: 403 });
  }

  const caller = await findEventParticipantByEmail(eventId, auth.email);
  if (!caller || !caller.visibleForReconnect) {
    return NextResponse.json({ ok: false, error: "not_activated" }, { status: 403 });
  }

  const results = await listReconnectGallery(eventId);
  const callerParticipantId = eventParticipantId(eventId, normalizeEmail(auth.email));
  const filtered = results.filter((r) => r.participantId !== callerParticipantId);
  return NextResponse.json({ ok: true, results: filtered });
}
