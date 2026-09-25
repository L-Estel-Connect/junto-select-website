import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getEligibleEvent, reconnectWindowState } from "@/lib/eventReconnect/eventConfig";
import { eventParticipantId, normalizeEmail } from "@/lib/eventReconnect/identifiers";
import { findEventParticipantByEmail } from "@/lib/eventReconnect/participants";
import { searchReconnectCandidatesByName } from "@/lib/eventReconnect/discovery";

export const runtime = "nodejs";

/**
 * Server-side, prefix-only name search scoped to exactly one event —
 * never a client Firestore query (eventParticipants has no client read
 * path at all, see firestore.rules). Requires the caller to be a genuine,
 * ACTIVATED participant of THIS event and the discovery window to be
 * currently open — both re-verified here independently of whatever the
 * client's own state view claims, so closed events can never be probed
 * through direct API calls (see the audit's security requirements).
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

  const name = new URL(request.url).searchParams.get("name") ?? "";
  const results = await searchReconnectCandidatesByName(eventId, name);
  // Never let someone find themselves in their own search results.
  const callerParticipantId = eventParticipantId(eventId, normalizeEmail(auth.email));
  const filtered = results.filter((r) => r.participantId !== callerParticipantId);
  return NextResponse.json({ ok: true, results: filtered });
}
