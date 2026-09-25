import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";
import { getAge } from "@/lib/introduction/age";
import { getEligibleEvent, reconnectWindowState } from "./eventConfig";
import { findAllEventParticipantsByEmail, findEventParticipantByEmail } from "./participants";
import { listPendingReconnectRequestsForMember } from "./requests";
import { MAX_RECONNECT_REQUESTS_PER_EVENT, type EventParticipantDocument } from "./types";
import type { ActiveReconnectEventView, ReconnectCandidateView, ReconnectStateView } from "./types";

/**
 * The one place that decides "is this signed-in caller even allowed to be
 * here for this event" — every discovery/request route calls this first.
 * Never trusts a client-supplied claim of attendance; always re-derives it
 * from the caller's own verified email against eventParticipants.
 */
export async function getReconnectStateForCaller(eventId: string, verifiedEmail: string): Promise<ReconnectStateView | { error: "event_not_found" }> {
  const event = await getEligibleEvent(eventId);
  if (!event) return { error: "event_not_found" };

  const participant = await findEventParticipantByEmail(eventId, verifiedEmail);
  return {
    windowState: reconnectWindowState(event),
    eventLabel: event.label,
    requestsRemaining: participant ? Math.max(0, MAX_RECONNECT_REQUESTS_PER_EVENT - participant.requestsSent) : null,
    isParticipant: !!participant,
    isActivated: !!participant?.visibleForReconnect,
  };
}

/**
 * The one thing MemberHome.tsx needs to decide whether to show its small
 * additive Reconnect card, without already knowing an eventId — an already-
 * finalized member (e.g. Lara) reaches /reconnect/[eventId] this way rather
 * than through an activation-invite email. Checks, in order: any event this
 * email is a participant of whose discovery window is open right now, else
 * any of the caller's own still-pending Reconnect requests (so the card
 * keeps pointing at the right place through the 72h response window even
 * after discovery has closed). Returns null when there's genuinely nothing
 * Reconnect-relevant — MemberHome shows nothing at all in that case, exactly
 * as the product spec's "before/during event" state requires.
 */
export async function getActiveReconnectEventForMember(
  verifiedEmail: string,
  personId: string,
): Promise<ActiveReconnectEventView | null> {
  const participations = await findAllEventParticipantsByEmail(verifiedEmail);
  for (const participant of participations) {
    const event = await getEligibleEvent(participant.eventId);
    if (event && reconnectWindowState(event) === "open") {
      return { eventId: participant.eventId, eventLabel: event.label };
    }
  }

  const pending = await listPendingReconnectRequestsForMember(personId);
  if (pending.length > 0) {
    return { eventId: pending[0].eventId, eventLabel: pending[0].eventLabel };
  }

  return null;
}

async function buildCandidateView(
  participant: EventParticipantDocument,
  participantId: string,
  callerParticipantId: string,
): Promise<ReconnectCandidateView | null> {
  if (!participant.claimedUid) return null;
  const profileSnap = await adminDb.doc(`profiles/${participant.claimedUid}`).get();
  if (!profileSnap.exists) return null;
  const profile = withProfileDefaults(participant.claimedUid, profileSnap.data() as Partial<ProfileDocument>);
  const age = profile.private.birthDate
    ? getAge((profile.private.birthDate as unknown as { toDate: () => Date }).toDate().toISOString().slice(0, 10))
    : null;
  return {
    participantId,
    firstName: profile.visible.firstName || "—",
    age,
    photoPath: profile.photos[0] ?? null,
    isSelf: participantId === callerParticipantId,
  };
}

/**
 * Search is server-side, exact-prefix, case-insensitive, scoped to exactly
 * this event's activated+consenting participants — never a client-side
 * query against eventParticipants (see firestore.rules: that collection
 * has no client read path at all). A zero-match result and a "you're not
 * allowed here" result must look identical to the caller for events they
 * didn't attend — enforced by requiring the caller's own participant
 * record to exist (checked by the route, not duplicated here) before this
 * is ever called.
 *
 * The caller's OWN activated profile is included here if it matches the
 * query, exactly like anyone else's — deliberately never filtered out (see
 * ReconnectCandidateView.isSelf's doc comment: the product intent is that
 * a person can see themselves inside the exact same participant
 * experience others see, not a separate preview).
 */
export async function searchReconnectCandidatesByName(
  eventId: string,
  namePrefix: string,
  callerParticipantId: string,
): Promise<ReconnectCandidateView[]> {
  const normalized = namePrefix.trim().toLowerCase();
  if (!normalized) return [];

  const snap = await adminDb
    .collection("eventParticipants")
    .where("eventId", "==", eventId)
    .where("visibleForReconnect", "==", true)
    .get();

  const matches: ReconnectCandidateView[] = [];
  for (const doc of snap.docs) {
    const participant = doc.data() as EventParticipantDocument;
    const view = await buildCandidateView(participant, doc.id, callerParticipantId);
    if (view && view.firstName.toLowerCase().startsWith(normalized)) {
      matches.push(view);
    }
  }
  return matches;
}

/**
 * The visual fallback — every activated+consenting participant for this
 * event, in neutral (insertion) order, never ranked/personalized/filtered
 * by any signal. Name + one photo only (see ReconnectCandidateView) — no
 * bio, no compatibility, nothing else, by construction (the view type
 * simply has no such fields to leak). Includes the caller's own card, same
 * reasoning as searchReconnectCandidatesByName above.
 */
export async function listReconnectGallery(eventId: string, callerParticipantId: string): Promise<ReconnectCandidateView[]> {
  const snap = await adminDb
    .collection("eventParticipants")
    .where("eventId", "==", eventId)
    .where("visibleForReconnect", "==", true)
    .get();

  const views: ReconnectCandidateView[] = [];
  for (const doc of snap.docs) {
    const view = await buildCandidateView(doc.data() as EventParticipantDocument, doc.id, callerParticipantId);
    if (view) views.push(view);
  }
  return views;
}
