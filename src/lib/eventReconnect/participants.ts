import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { eventParticipantId, normalizeEmail } from "./identifiers";
import type { EventParticipantDocument } from "./types";

/**
 * V1 deliberately does NOT pull attendee lists live from a Ticket Tailor
 * API endpoint — that would be a new, unverified integration surface (this
 * codebase's only verified Ticket Tailor API usage is /v1/discounts, kept
 * behind TICKET_TAILOR_INTEGRATION_VERIFIED specifically because every
 * request shape had to be proven against the real API first). Ticket
 * Tailor's own dashboard already exports attendee/order data as CSV;
 * importing FROM that export (via this admin-triggered function, one row
 * per attendee) is the same "external data -> import record" shape
 * legacyImport already uses for a different source, and adds zero new
 * external API risk. Upgrading to a live pull later is a separate,
 * independently-verifiable change, not something to bundle into Reconnect.
 */
export interface ImportEventParticipantRow {
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  ticketTailorOrderId: string | null;
}

export interface ImportEventParticipantsResult {
  attempted: number;
  imported: number;
  alreadyImported: number;
}

/**
 * Upserts one EventParticipant per row, deduped by {eventId, normalizedEmail}
 * — a second ticket bought by the same email for the same event safely
 * collapses onto the same record (never a second, duplicate participant).
 * Never touches consent/activation fields on an already-existing record —
 * re-running an import (e.g. a corrected CSV) must never silently reset
 * someone who already activated back to invisible.
 */
export async function importEventParticipants(
  eventId: string,
  rows: ImportEventParticipantRow[],
): Promise<ImportEventParticipantsResult> {
  const result: ImportEventParticipantsResult = { attempted: rows.length, imported: 0, alreadyImported: 0 };
  const now = FieldValue.serverTimestamp();

  for (const row of rows) {
    const normalizedEmail = normalizeEmail(row.email);
    if (!normalizedEmail) continue;
    const ref = adminDb.doc(`eventParticipants/${eventParticipantId(eventId, normalizedEmail)}`);
    const existing = await ref.get();
    if (existing.exists) {
      result.alreadyImported += 1;
      continue;
    }
    const doc: EventParticipantDocument = {
      eventId,
      normalizedEmail,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      ticketTailorOrderId: row.ticketTailorOrderId,
      status: "imported",
      claimedUid: null,
      claimedPersonId: null,
      collisionUid: null,
      visibleForReconnect: false,
      acceptsConnectionRequests: false,
      activatedAt: null,
      invitationEmailSentAt: null,
      requestsSent: 0,
      importedAt: now,
      claimedAt: null,
      optedOutAt: null,
      updatedAt: now,
    };
    await ref.create(doc);
    result.imported += 1;
  }

  return result;
}

export type ClaimEventParticipantResult =
  | { ok: true; participantId: string }
  | { ok: false; error: "not_found" | "claimed_by_other" };

/**
 * The ONLY way an EventParticipant is ever attached to a real uid — same
 * transactional, collision-safe shape as legacyImport's claimLegacyContact,
 * driven entirely by the caller's own server-verified authenticated email.
 * Unlike legacyImport, a collision here (the participant was already
 * claimed by a DIFFERENT uid) is not expected to be common — the same
 * ticket email claimed twice by two different Junto accounts — but is
 * still handled explicitly rather than silently overwritten. Idempotent:
 * calling again with the same uid that already claimed it is a no-op
 * success.
 */
export async function claimEventParticipant(
  eventId: string,
  verifiedEmail: string,
  uid: string,
  personId: string,
): Promise<ClaimEventParticipantResult> {
  const normalizedEmail = normalizeEmail(verifiedEmail);
  const id = eventParticipantId(eventId, normalizedEmail);
  const ref = adminDb.doc(`eventParticipants/${id}`);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, error: "not_found" };
    const data = snap.data() as EventParticipantDocument;

    if (data.claimedUid && data.claimedUid === uid) {
      return { ok: true, participantId: id };
    }
    if (data.claimedUid && data.claimedUid !== uid) {
      return { ok: false, error: "claimed_by_other" };
    }

    const now = FieldValue.serverTimestamp();
    tx.update(ref, {
      status: "claimed",
      claimedUid: uid,
      claimedPersonId: personId,
      claimedAt: now,
      updatedAt: now,
    });
    return { ok: true, participantId: id };
  });
}

/** Read-only lookup by the AUTHENTICATED caller's own email — never by an arbitrary email a client could supply for someone else. */
export async function findEventParticipantByEmail(eventId: string, verifiedEmail: string): Promise<EventParticipantDocument | null> {
  const id = eventParticipantId(eventId, normalizeEmail(verifiedEmail));
  const snap = await adminDb.doc(`eventParticipants/${id}`).get();
  return snap.exists ? (snap.data() as EventParticipantDocument) : null;
}

export async function getEventParticipant(participantId: string): Promise<EventParticipantDocument | null> {
  const snap = await adminDb.doc(`eventParticipants/${participantId}`).get();
  return snap.exists ? (snap.data() as EventParticipantDocument) : null;
}

export type OptOutEventParticipantResult =
  | { ok: true; participantId: string }
  | { ok: false; error: "not_found" };

/**
 * "No quiero participar" — the destructive, explicit opt-out offered
 * alongside "Activar Reconnect" on the activation landing screen. Never
 * touches `profiles/{uid}` or the Firebase Auth account: this is scoped
 * exclusively to this one event's Reconnect participation, exactly like
 * `delete-profile`'s full-account deletion is a completely separate, only
 * explicitly-requested action. Anonymizes the Ticket-Tailor-imported PII
 * fields (never the participant document itself — its id must stay stable
 * so a later corrected CSV re-import treats this email as already handled
 * rather than re-creating a fresh, visible attendee — see
 * importEventParticipants's "already imported" skip). Idempotent: opting
 * out twice is a no-op success. Pending requests directed at this
 * participant are resolved by the caller (see requests.ts's
 * cancelPendingRequestsForParticipant) — this function only owns the
 * participant record itself.
 */
export async function optOutEventParticipant(eventId: string, verifiedEmail: string): Promise<OptOutEventParticipantResult> {
  const participantId = eventParticipantId(eventId, normalizeEmail(verifiedEmail));
  const ref = adminDb.doc(`eventParticipants/${participantId}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "not_found" };

  await ref.update({
    status: "opted_out",
    visibleForReconnect: false,
    acceptsConnectionRequests: false,
    showPhotoInReconnect: false,
    firstName: null,
    lastName: null,
    phone: null,
    optedOutAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, participantId };
}

export type SetShowPhotoInReconnectResult = { ok: true } | { ok: false; error: "not_found" | "not_activated" };

/**
 * The editable "Mostrar mi foto en Reconnect" ON/OFF preference — stored on
 * the event participant record, never on the shared ProfileDocument, so
 * flipping it can never affect Private Introductions' own photo. Requires
 * the caller to already be an activated participant of this event; turning
 * it back on doesn't re-upload anything, it just resumes reading
 * `profile.photos[0]` in discovery.ts (see buildCandidateView).
 */
export async function setShowPhotoInReconnect(
  eventId: string,
  verifiedEmail: string,
  show: boolean,
): Promise<SetShowPhotoInReconnectResult> {
  const participantId = eventParticipantId(eventId, normalizeEmail(verifiedEmail));
  const ref = adminDb.doc(`eventParticipants/${participantId}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "not_found" };
  const data = snap.data() as EventParticipantDocument;
  if (!data.visibleForReconnect) return { ok: false, error: "not_activated" };

  await ref.update({ showPhotoInReconnect: show, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

/**
 * Every EventParticipant record across every event for this one verified
 * email — used only by getActiveReconnectEventForMember (see discovery.ts)
 * to answer "does this member have any currently-relevant Reconnect event"
 * without MemberHome needing to already know an eventId. A single-field
 * equality query, so it needs no composite index; realistically returns 0-2
 * documents for almost every member (one per Junto event they've attended).
 */
export async function findAllEventParticipantsByEmail(verifiedEmail: string): Promise<EventParticipantDocument[]> {
  const normalizedEmail = normalizeEmail(verifiedEmail);
  const snap = await adminDb.collection("eventParticipants").where("normalizedEmail", "==", normalizedEmail).get();
  return snap.docs.map((d) => d.data() as EventParticipantDocument);
}
