/**
 * Junto Select Reconnect — plain types only (no Firebase Admin imports),
 * same convention as eventBenefits/types.ts. See the product/architecture
 * audit for the full reasoning; this file is deliberately small: exactly
 * two new collections on top of the existing profile/matching/Connexiones
 * infrastructure.
 */

/**
 * `eventParticipants/{eventId}_{sha256(normalizedEmail).slice(0,32)}` — one
 * record per Ticket Tailor attendee of one event, created at import time,
 * NEVER client-readable (see firestore.rules). Buying a ticket only ever
 * produces `status: "imported"` with both consent flags false — visible to
 * no one, findable by no one, until the person explicitly activates.
 *
 * `firstName`/`lastName`/`phone` here are Ticket Tailor's OWN record of the
 * attendee, kept only for admin reference and for prefilling the
 * activation form — never shown to another member directly. What another
 * member actually sees always comes from the real `ProfileDocument`
 * (`visible.firstName`, `photos[0]`) once activation has written to it —
 * see activation.ts.
 */
export type EventParticipantStatus = "imported" | "claimed";

export interface EventParticipantDocument {
  eventId: string;
  normalizedEmail: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  ticketTailorOrderId: string | null;
  status: EventParticipantStatus;
  claimedUid: string | null;
  claimedPersonId: string | null;
  /** Set only when a DIFFERENT uid already claimed this exact participant — never overwritten, admin visibility only (mirrors legacyImport's collision handling). */
  collisionUid: string | null;
  /**
   * Two independent flags rather than one, even though V1's activation UI
   * sets both together with a single consent action — see the audit's
   * reasoning: a future version may let someone be findable by name
   * without appearing in the visual gallery, or vice versa, without a
   * schema change.
   */
  visibleForReconnect: boolean;
  acceptsConnectionRequests: boolean;
  activatedAt: unknown | null;
  /**
   * Set the first (and only) time a "someone wants to reconnect with you"
   * activation-invite email is queued for this participant — caps that
   * email at exactly one per event no matter how many different people
   * request them (see requests.ts). Never reset.
   */
  invitationEmailSentAt: unknown | null;
  /** How many EventReconnectRequests this participant has personally INITIATED for this event — see requests.ts's transactional enforcement of the max-3 rule. Never decremented by cancellation, decline, or expiry. */
  requestsSent: number;
  importedAt: unknown;
  claimedAt: unknown | null;
  updatedAt: unknown;
}

export const MAX_RECONNECT_REQUESTS_PER_EVENT = 3;
/** Discovery (search/gallery/new-request-initiation) window, from Reconnect's computed open time. */
export const RECONNECT_DISCOVERY_WINDOW_HOURS = 48;
/** A sent request stays answerable this long from when it was SENT, independent of whether discovery is still open. */
export const RECONNECT_RESPONSE_WINDOW_HOURS = 72;

export type ReconnectWindowState = "not_yet_open" | "open" | "discovery_closed";

/**
 * `eventReconnectRequests/{eventId}_{personIdLow}_{personIdHigh}` — one
 * doc per UNORDERED pair per event (mirrors pairHistory's sorted-pair
 * convention), so a request already pending in one direction can never be
 * duplicated by the other side also trying to "request" — they see and
 * decide the existing one instead. `personId`, not raw uid, resolves
 * correctly through the existing duplicate-account merge machinery (see
 * identity.ts) — a uid is snapshotted alongside its personId purely for
 * display/notification, exactly like ProposalDocument/InvitationDocument
 * already do.
 */
export type EventReconnectRequestStatus = "pending" | "accepted" | "declined" | "expired";

export interface EventReconnectRequestDocument {
  eventId: string;
  personIdLow: string;
  personIdHigh: string;
  /** Who actually sent it — the other of the pair is the recipient. */
  initiatorPersonId: string;
  initiatorUid: string;
  recipientPersonId: string;
  recipientUid: string;
  status: EventReconnectRequestStatus;
  createdAt: unknown;
  /** createdAt + RECONNECT_RESPONSE_WINDOW_HOURS — computed once at creation, never recomputed. */
  responseDeadline: unknown;
  decidedAt: unknown | null;
}

/**
 * Plain view/response shapes below — kept in this "server-only"-free file
 * (same convention as matching/memberLifecycleTypes.ts) so both the
 * "server-only" modules that build them (discovery.ts, requests.ts) AND the
 * client components that render the API responses carrying them can import
 * the identical type, rather than each side redefining its own.
 */

export interface ReconnectStateView {
  windowState: ReconnectWindowState;
  eventLabel: string;
  /** Only meaningful once activated — null otherwise. */
  requestsRemaining: number | null;
  isParticipant: boolean;
  isActivated: boolean;
}

/**
 * A minimal, name-only lookup — never the underlying profile beyond what a
 * Reconnect card is allowed to show. The caller's OWN activated profile is
 * deliberately included in search/gallery results (not filtered out) so
 * they can see exactly how they appear to other attendees, in the same
 * card UI — `isSelf` is what the client uses to hide the request button
 * and add a "Tú" label, never a signal to render a different component.
 */
export interface ReconnectCandidateView {
  participantId: string;
  firstName: string;
  age: number | null;
  photoPath: string | null;
  isSelf: boolean;
}

/** The single most relevant Reconnect event for a member right now, if any — see getActiveReconnectEventForMember. */
export interface ActiveReconnectEventView {
  eventId: string;
  eventLabel: string;
}

export interface PendingReconnectRequestView {
  id: string;
  eventId: string;
  eventLabel: string;
  /** Whether the caller sent this one or received it. */
  direction: "sent" | "received";
  otherFirstName: string;
  responseDeadline: unknown;
}
