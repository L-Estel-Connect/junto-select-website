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
 *
 * Deliberately does NOT filter the caller's own result out: they're meant
 * to see themselves in search exactly as anyone else would (see
 * ReconnectCandidateView.isSelf) — the client hides the request button for
 * that one card, but the read itself, and the card rendering, are
 * identical to any other participant's.
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
  const callerParticipantId = eventParticipantId(eventId, normalizeEmail(auth.email));
  const results = await searchReconnectCandidatesByName(eventId, name, callerParticipantId);
  return NextResponse.json({ ok: true, results });
}
