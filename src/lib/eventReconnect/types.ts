/**
 * Junto Select Reconnect — plain types only (no Firebase Admin imports),
 * same convention as eventBenefits/types.ts. See the product/architecture
 * audit for the full reasoning; this file is deliberately small: exactly
 * two new collections on top of the existing profile/matching/Connexiones
 * infrastructure.
 */

/**
 * `eventParticipants/{eventId}_{sha256(normalizedEmail).slice(0,32)}` — one
 * record per Ticket Tailor attendee of one event, created at import time.
 * NEVER client-readable (see firestore.rules). Buying a ticket only ever
 * produces `status: "imported"` with both consent flags false.
 *
 * `imported` attendees ARE now potentially discoverable by first name (see
 * discovery.ts) — but only by first name and the fact that they attended
 * this event. `claimed` means they've explicitly activated and consented;
 * only then is their real photo/profile data ever reachable. `opted_out` is
 * the explicit, destructive "no quiero participar" choice (see
 * participants.ts's optOutEventParticipant) — permanently excluded from
 * discovery and from receiving further requests, distinct from simply never
 * having activated.
 *
 * `firstName`/`lastName`/`phone` here are Ticket Tailor's OWN record of the
 * attendee, kept for admin reference and for prefilling the activation
 * form. `firstName` alone is also what an un-activated attendee's discovery
 * card shows (see discovery.ts) — `lastName`/`phone` are never exposed to
 * another member under any circumstance. What an ACTIVATED member sees
 * always comes from the real `ProfileDocument` (`visible.firstName`,
 * `photos[0]`) once activation has written to it — see activation.ts.
 */
export type EventParticipantStatus = "imported" | "claimed" | "opted_out";

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
   * Photo-visibility preference for Reconnect ONLY — never touches
   * `ProfileDocument.photos` or Private Introductions. Missing/undefined is
   * treated as `true` (same "missing means the pre-existing behavior"
   * convention as `EligibleTicketTailorEventDocument.memberBenefitEnabled`)
   * so a participant activated before this field existed keeps showing
   * their photo exactly as before. Only ever read once `visibleForReconnect`
   * is true — meaningless (and never returned) before activation.
   */
  showPhotoInReconnect?: boolean;
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
  /** Set the one time this participant explicitly chooses "No quiero participar" — see optOutEventParticipant. Never cleared; there is no re-activation path in V1. */
  optedOutAt: unknown | null;
  updatedAt: unknown;
}

export const MAX_RECONNECT_REQUESTS_PER_EVENT = 3;
/** Discovery (search/gallery/new-request-initiation) window, from Reconnect's computed open time. */
export const RECONNECT_DISCOVERY_WINDOW_HOURS = 48;
/** A sent request stays answerable this long from when it was SENT, independent of whether discovery is still open. */
export const RECONNECT_RESPONSE_WINDOW_HOURS = 72;

export type ReconnectWindowState = "not_yet_open" | "open" | "discovery_closed";

/**
 * `eventReconnectRequests/{sorted(initiatorParticipantId, targetParticipantId)}`
 * — one doc per UNORDERED pair of PARTICIPANT ids per event (participant ids,
 * not person ids: a participant id is derivable from event+email alone and
 * exists for BOTH sides from the moment they're imported, regardless of
 * whether either has activated — a person id only exists once someone has
 * signed in and been resolved against a real profile, which an unactivated
 * target may never have done). This is what makes it possible to send a
 * request to someone who hasn't activated Reconnect yet.
 *
 * `recipientPersonId`/`recipientUid` are null until the target activates —
 * see requests.ts's `resolvePendingRequestsForActivatedParticipant`, called
 * from activation.ts, which backfills them once the target's real identity
 * is known. Until then this request is invisible to
 * `listPendingReconnectRequestsForMember` (which queries by person id), by
 * construction — exactly the "David can't see it until he activates"
 * requirement.
 */
export type EventReconnectRequestStatus = "pending" | "accepted" | "declined" | "expired";

export interface EventReconnectRequestDocument {
  eventId: string;
  initiatorParticipantId: string;
  initiatorPersonId: string;
  initiatorUid: string;
  targetParticipantId: string;
  /** Null until the target activates Reconnect for this event. */
  recipientPersonId: string | null;
  recipientUid: string | null;
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
  /** True once this participant has explicitly chosen "No quiero participar" — a terminal state, distinct from simply never having activated. */
  hasOptedOut: boolean;
  /** Only meaningful once activated — the caller's current Reconnect photo-visibility preference, for the editable ON/OFF toggle. Missing/undefined on the underlying record is treated as `true`, same convention as everywhere else this field is read. */
  showPhotoInReconnect: boolean;
  /**
   * True when this (not-yet-activated) participant has a live incoming
   * request still within its own 72h response deadline — lets the UI allow
   * activation even after the 48h discovery window has otherwise closed,
   * so a request received late in that window doesn't strand its recipient.
   * Never widens anything else: search/gallery/new-request-creation stay
   * governed by `windowState` alone.
   */
  hasPendingIncomingRequest: boolean;
}

/**
 * A minimal, name-only lookup — never the underlying profile beyond what a
 * Reconnect card is allowed to show. The caller's OWN activated profile is
 * deliberately included in search/gallery results (not filtered out) so
 * they can see exactly how they appear to other attendees, in the same
 * card UI — `isSelf` is what the client uses to hide the request button
 * and add a "Tú" label, never a signal to render a different component.
 *
 * `activated: false` means an imported-but-not-yet-activated attendee —
 * `photoPath` is always null in that case (their personal data, including
 * any photo, is never exposed pre-activation). `activated: true` with
 * `photoPath: null` means they DID activate but chose not to display a
 * photo (`showPhotoInReconnect: false`) or simply have none yet — the
 * client renders a neutral elegant placeholder for that case, never the
 * "not activated" status text.
 */
export interface ReconnectCandidateView {
  participantId: string;
  firstName: string;
  photoPath: string | null;
  activated: boolean;
  isSelf: boolean;
  /**
   * The caller's own relationship to this candidate, server-derived fresh
   * on every read — never a client-side "I clicked this" guess. `"none"`:
   * no request exists between them yet, in either direction — the normal
   * request button applies. `"pending"`: an `eventReconnectRequests` doc
   * exists between them and is still `"pending"`, regardless of who
   * initiated it — the button is disabled either way, since sending
   * another would just hit the existing doc's idempotency guard. `"accepted"`:
   * they're already connected — never re-requestable. `"closed"`: the
   * existing request was declined or expired — also never re-requestable
   * (the doc's deterministic id means a repeat "request" call would just
   * no-op against the same doc regardless), shown as a discreet neutral
   * state rather than the normal button. Always `"none"` for `isSelf`.
   */
  requestStatus: "none" | "pending" | "accepted" | "closed";
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
  /**
   * The other party's permitted Reconnect photo, or null — either because
   * they haven't activated, or they activated with
   * `showPhotoInReconnect: false`. Same privacy rule as
   * ReconnectCandidateView.photoPath, computed the identical way — never
   * the underlying ProfileDocument photo when that preference is off.
   */
  otherPhotoPath: string | null;
  responseDeadline: unknown;
}
