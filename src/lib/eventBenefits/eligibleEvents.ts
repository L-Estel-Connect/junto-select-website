import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { getTicketTailorClient } from "@/lib/ticketTailor/client";
import type { EligibleTicketTailorEventDocument, EventBenefitDocument } from "./types";

/**
 * Every currently-eligible ticket type id, flattened across every
 * registered eligible event — what a newly-granted monthly benefit is
 * associated with at creation time (see lifecycle.ts). Small collection,
 * read in full on every grant; no pagination needed at this scale (see
 * the Ticket Tailor API audit's scale findings).
 */
export async function getAllEligibleTicketTypeIds(): Promise<string[]> {
  const snap = await adminDb.collection("eligibleTicketTailorEvents").get();
  const ids = new Set<string>();
  for (const doc of snap.docs) {
    const data = doc.data() as EligibleTicketTailorEventDocument;
    for (const id of data.ticketTailorTicketTypeIds) ids.add(id);
  }
  return [...ids];
}

export async function listEligibleEvents(): Promise<EligibleTicketTailorEventDocument[]> {
  const snap = await adminDb.collection("eligibleTicketTailorEvents").get();
  return snap.docs.map((d) => d.data() as EligibleTicketTailorEventDocument);
}

/**
 * Admin-only — registers (or updates) which Ticket Tailor ticket types
 * participate in the member benefit for a given event. Deliberately NOT
 * derived from any Ticket Tailor-side tag/category (no such supported
 * mechanism exists — see the Ticket Tailor API audit); Junto's own
 * Firestore record is the sole source of truth for eligibility.
 */
export async function registerEligibleEvent(params: {
  ticketTailorEventId: string;
  ticketTailorTicketTypeIds: string[];
  label: string;
  /** YYYY-MM-DD, Madrid-local — required for Reconnect to ever be available for this event; omit/null if unknown. */
  eventDate?: string | null;
  /** Defaults to false — registering an event for the discount benefit must never implicitly enable Reconnect. */
  reconnectEnabled?: boolean;
}): Promise<void> {
  const now = new Date();
  const ref = adminDb.doc(`eligibleTicketTailorEvents/${params.ticketTailorEventId}`);
  const existing = await ref.get();
  const existingData = existing.data() as EligibleTicketTailorEventDocument | undefined;
  await ref.set(
    {
      ticketTailorEventId: params.ticketTailorEventId,
      ticketTailorTicketTypeIds: params.ticketTailorTicketTypeIds,
      label: params.label,
      createdAt: existing.exists ? existingData?.createdAt : now,
      updatedAt: now,
      lastSyncedAt: existing.exists ? (existingData?.lastSyncedAt ?? null) : null,
      lastSyncResult: existing.exists ? (existingData?.lastSyncResult ?? null) : null,
      eventDate: params.eventDate ?? existingData?.eventDate ?? null,
      reconnectEnabled: params.reconnectEnabled ?? existingData?.reconnectEnabled ?? false,
      // Never reset by re-registering the event — the force-close override
      // is a dedicated, separate admin action (see setReconnectForceClosed
      // in eventReconnect/eventConfig.ts) and must survive an unrelated
      // edit to ticket types/label.
      reconnectForceClosedAt: existingData?.reconnectForceClosedAt ?? null,
    } satisfies EligibleTicketTailorEventDocument,
    { merge: false },
  );
}

export interface SyncEventResult {
  attempted: number;
  succeeded: number;
  failed: number;
  failedCycleKeys: string[];
}

const SYNC_BATCH_SIZE = 200;

/**
 * "Sync member discounts to this event" — the V1, admin-triggered,
 * explicit alternative to a Ticket Tailor event.created webhook (a
 * deliberate launch-simplicity choice, see the implementation report).
 * Associates every currently-ACTIVE member benefit's Ticket Tailor
 * discount with this event's eligible ticket type(s).
 *
 * Idempotent and safe to re-run: associateDiscountWithTicketTypes is
 * itself specified as idempotent (see ticketTailor/client.ts), and this
 * function only ever reads the current `active` set fresh each call —
 * running it twice in a row (or after a partial failure) simply retries
 * whatever didn't succeed the first time, without re-touching what did.
 * Bounded per call (SYNC_BATCH_SIZE) and reports partial failure rather
 * than an all-or-nothing Promise.all, per the scale requirements.
 */
export async function syncEligibleEvent(ticketTailorEventId: string): Promise<SyncEventResult> {
  const eventRef = adminDb.doc(`eligibleTicketTailorEvents/${ticketTailorEventId}`);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) {
    throw new Error("eligible_event_not_found");
  }
  const event = eventSnap.data() as EligibleTicketTailorEventDocument;

  const activeSnap = await adminDb.collection("eventBenefits").where("status", "==", "active").limit(SYNC_BATCH_SIZE).get();

  const result: SyncEventResult = { attempted: 0, succeeded: 0, failed: 0, failedCycleKeys: [] };
  const client = getTicketTailorClient();

  for (const doc of activeSnap.docs) {
    const benefit = doc.data() as EventBenefitDocument;
    if (!benefit.ticketTailorDiscountId) continue; // still pending external creation — will pick up eligibility on its own creation call
    result.attempted += 1;
    try {
      await client.associateDiscountWithTicketTypes(benefit.ticketTailorDiscountId, event.ticketTailorTicketTypeIds);
      result.succeeded += 1;
    } catch (error) {
      console.error(`syncEligibleEvent: failed to associate cycle ${benefit.cycleKey} with event ${ticketTailorEventId}`, error);
      result.failed += 1;
      result.failedCycleKeys.push(benefit.cycleKey);
    }
  }

  await eventRef.update({
    lastSyncedAt: new Date(),
    lastSyncResult: { attempted: result.attempted, succeeded: result.succeeded, failed: result.failed },
  });

  return result;
}
