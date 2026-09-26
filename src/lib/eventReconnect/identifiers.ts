import "server-only";
import { createHash } from "node:crypto";

/** Same treatment as legacyImport's legacyImportId — a stable, non-reversible id from the normalized email, scoped per event so the same person across two events gets two independent participant records. */
export function eventParticipantId(eventId: string, normalizedEmail: string): string {
  const emailHash = createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 32);
  return `${eventId}_${emailHash}`;
}

/**
 * Sorted-pair id, mirroring pairHistory's personIdLow/personIdHigh
 * convention — one doc per unordered pair of PARTICIPANT ids per event
 * (never person ids: a target may not have activated yet, and therefore may
 * not have a person id at all — see types.ts's EventReconnectRequestDocument
 * doc comment). Participant ids are already event-scoped, so no extra
 * `eventId` prefix is needed for uniqueness, but one is kept for readability.
 */
export function eventReconnectRequestId(eventId: string, participantIdA: string, participantIdB: string): string {
  const [participantIdLow, participantIdHigh] = [participantIdA, participantIdB].sort();
  return `${eventId}_${participantIdLow}_${participantIdHigh}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
