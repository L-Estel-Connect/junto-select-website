import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";
import { getEligibleEvent, reconnectWindowState } from "./eventConfig";
import { eventParticipantId, eventReconnectRequestId, normalizeEmail } from "./identifiers";
import { findAllEventParticipantsByEmail, findEventParticipantByEmail } from "./participants";
import { hasLivePendingIncomingRequest, listPendingReconnectRequestsForMember } from "./requests";
import { MAX_RECONNECT_REQUESTS_PER_EVENT, type EventParticipantDocument, type EventReconnectRequestDocument } from "./types";
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
  const participantId = eventParticipantId(eventId, normalizeEmail(verifiedEmail));
  const hasPendingIncomingRequest =
    !!participant && !participant.visibleForReconnect && participant.status !== "opted_out"
      ? await hasLivePendingIncomingRequest(participantId)
      : false;

  return {
    windowState: reconnectWindowState(event),
    eventLabel: event.label,
    requestsRemaining: participant ? Math.max(0, MAX_RECONNECT_REQUESTS_PER_EVENT - participant.requestsSent) : null,
    isParticipant: !!participant,
    isActivated: !!participant?.visibleForReconnect,
    hasOptedOut: participant?.status === "opted_out",
    showPhotoInReconnect: participant?.showPhotoInReconnect !== false,
    hasPendingIncomingRequest,
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

/**
 * Builds one discovery card. Three distinct outcomes, all deliberate (see
 * types.ts's ReconnectCandidateView doc comment):
 *  - opted out: excluded entirely (returns null) — never findable again.
 *  - not yet activated: `firstName` only, from Ticket Tailor's own imported
 *    record — NEVER a photo, age, email, phone, or any other profile field,
 *    since none of that has been consented to yet. A missing/blank imported
 *    first name means this attendee simply can't be shown at all (there is
 *    nothing safe to render), so it's excluded too.
 *  - activated: the real `ProfileDocument` first name, and the real photo
 *    ONLY if `showPhotoInReconnect` isn't explicitly `false` — otherwise
 *    `photoPath: null`, which the client renders as a neutral placeholder,
 *    never as the "not activated" status text (the `activated: true` flag
 *    is what tells it which).
 *
 * Also resolves `requestStatus` — the caller's own relationship to this
 * candidate — fresh from `eventReconnectRequests` every time, via the same
 * deterministic sorted-participant-id doc id `createReconnectRequest`
 * itself writes to (see identifiers.ts). This is what makes the gallery
 * correctly show "✓ Conectados" after an acceptance, "Solicitud enviada"
 * while pending, and a discreet closed state after a decline — server
 * state, not a client-side guess that resets on reload (see the audit).
 */
async function resolveRequestStatus(
  eventId: string,
  callerParticipantId: string,
  candidateParticipantId: string,
): Promise<ReconnectCandidateView["requestStatus"]> {
  if (callerParticipantId === candidateParticipantId) return "none";
  const id = eventReconnectRequestId(eventId, callerParticipantId, candidateParticipantId);
  const snap = await adminDb.doc(`eventReconnectRequests/${id}`).get();
  if (!snap.exists) return "none";
  const status = (snap.data() as EventReconnectRequestDocument).status;
  if (status === "accepted") return "accepted";
  if (status === "pending") return "pending";
  return "closed"; // declined or expired — never re-requestable either way
}

async function buildCandidateView(
  eventId: string,
  participant: EventParticipantDocument,
  participantId: string,
  callerParticipantId: string,
): Promise<ReconnectCandidateView | null> {
  if (participant.status === "opted_out") return null;
  const isSelf = participantId === callerParticipantId;
  const requestStatus = await resolveRequestStatus(eventId, callerParticipantId, participantId);

  if (!participant.visibleForReconnect || !participant.claimedUid) {
    const firstName = participant.firstName?.trim();
    if (!firstName) return null;
    return { participantId, firstName, photoPath: null, activated: false, isSelf, requestStatus };
  }

  const profileSnap = await adminDb.doc(`profiles/${participant.claimedUid}`).get();
  if (!profileSnap.exists) return null;
  const profile = withProfileDefaults(participant.claimedUid, profileSnap.data() as Partial<ProfileDocument>);
  const photoPath = participant.showPhotoInReconnect !== false ? (profile.photos[0] ?? null) : null;
  return {
    participantId,
    firstName: profile.visible.firstName || "—",
    photoPath,
    activated: true,
    isSelf,
    requestStatus,
  };
}

/**
 * Search is server-side, exact-prefix, case-insensitive, scoped to exactly
 * this event's imported attendees (any status other than opted-out — see
 * buildCandidateView) — never a client-side query against eventParticipants
 * (see firestore.rules: that collection has no client read path at all). A
 * zero-match result and a "you're not allowed here" result must look
 * identical to the caller for events they didn't attend — enforced by
 * requiring the caller's own participant record to exist (checked by the
 * route, not duplicated here) before this is ever called.
 *
 * Deliberately queries ALL of this event's participants, not only
 * `visibleForReconnect == true` ones — an imported-but-not-yet-activated
 * attendee is now findable by first name too (see the product spec:
 * "allow event attendees who have not yet activated Reconnect to appear in
 * a limited/locked state"); buildCandidateView is what actually decides
 * what each one is allowed to reveal. Filtering happens in memory rather
 * than via an extra Firestore inequality filter — the same "fetch this
 * event's participants once, decide per-doc" shape getReconnectAdminSummary
 * already uses, and one event's attendee list is never large enough for
 * that to matter.
 *
 * The caller's OWN card is included here if it matches the query, exactly
 * like anyone else's — deliberately never filtered out (see
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

  const snap = await adminDb.collection("eventParticipants").where("eventId", "==", eventId).get();

  const matches: ReconnectCandidateView[] = [];
  for (const doc of snap.docs) {
    const participant = doc.data() as EventParticipantDocument;
    const view = await buildCandidateView(eventId, participant, doc.id, callerParticipantId);
    if (view && view.firstName.toLowerCase().startsWith(normalized)) {
      matches.push(view);
    }
  }
  return matches;
}

/**
 * The visual fallback — every non-opted-out participant for this event, in
 * neutral (insertion) order, never ranked/personalized/filtered by any other
 * signal. First name + (conditionally) one photo only (see
 * ReconnectCandidateView) — no bio, no compatibility, no age, nothing else,
 * by construction (the view type simply has no such fields to leak).
 * Includes not-yet-activated attendees (name + neutral placeholder, see
 * buildCandidateView) and the caller's own card, same reasoning as
 * searchReconnectCandidatesByName above.
 */
export async function listReconnectGallery(eventId: string, callerParticipantId: string): Promise<ReconnectCandidateView[]> {
  const snap = await adminDb.collection("eventParticipants").where("eventId", "==", eventId).get();

  const views: ReconnectCandidateView[] = [];
  for (const doc of snap.docs) {
    const view = await buildCandidateView(eventId, doc.data() as EventParticipantDocument, doc.id, callerParticipantId);
    if (view) views.push(view);
  }
  return views;
}
