import "server-only";
import { createHash } from "node:crypto";

/** Same treatment as legacyImport's legacyImportId — a stable, non-reversible id from the normalized email, scoped per event so the same person across two events gets two independent participant records. */
export function eventParticipantId(eventId: string, normalizedEmail: string): string {
  const emailHash = createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 32);
  return `${eventId}_${emailHash}`;
}

/** Sorted-pair id, mirroring pairHistory's personIdLow/personIdHigh convention — one doc per unordered pair per event, so either side "requesting" the other always resolves to the same document. */
export function eventReconnectRequestId(eventId: string, personIdA: string, personIdB: string): string {
  const [personIdLow, personIdHigh] = [personIdA, personIdB].sort();
  return `${eventId}_${personIdLow}_${personIdHigh}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
