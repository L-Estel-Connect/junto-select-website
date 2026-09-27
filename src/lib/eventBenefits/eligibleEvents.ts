import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { EligibleTicketTailorEventDocument } from "./types";

export async function listEligibleEvents(): Promise<EligibleTicketTailorEventDocument[]> {
  const snap = await adminDb.collection("eligibleTicketTailorEvents").get();
  return snap.docs.map((d) => d.data() as EligibleTicketTailorEventDocument);
}

/**
 * Admin-only — registers (or updates) which Ticket Tailor ticket types
 * participate in the member benefit for a given event, its checkout URL,
 * and its Reconnect config. Deliberately NOT derived from any Ticket
 * Tailor-side tag/category (no such supported mechanism exists — see the
 * Ticket Tailor API audit); Junto's own Firestore record is the sole
 * source of truth for eligibility.
 */
export async function registerEligibleEvent(params: {
  ticketTailorEventId: string;
  /** Only meaningful (and only required — see the route's validation) when `memberBenefitEnabled` is true. A Reconnect-only registration passes an empty array here. */
  ticketTailorTicketTypeIds: string[];
  label: string;
  /** YYYY-MM-DD, Madrid-local — required whenever `memberBenefitEnabled` is true (it drives both eligibility and expiry — see eligibility.ts), and for Reconnect to ever be available for this event. */
  eventDate?: string | null;
  /** Defaults to false — registering an event must never implicitly enable Reconnect. */
  reconnectEnabled?: boolean;
  /** Defaults to false — fully independent of `reconnectEnabled`; see EligibleTicketTailorEventDocument's doc comment. */
  memberBenefitEnabled?: boolean;
  /** The real Ticket Tailor purchase page — powers the member-facing "Comprar entrada con -20%" CTA. Optional; the CTA just doesn't render without it. */
  ticketTailorCheckoutUrl?: string | null;
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
      memberBenefitEnabled: params.memberBenefitEnabled ?? existingData?.memberBenefitEnabled ?? false,
      ticketTailorCheckoutUrl: params.ticketTailorCheckoutUrl ?? existingData?.ticketTailorCheckoutUrl ?? null,
      // Never reset by re-registering the event — the force-close override
      // is a dedicated, separate admin action (see setReconnectForceClosed
      // in eventReconnect/eventConfig.ts) and must survive an unrelated
      // edit to ticket types/label.
      reconnectForceClosedAt: existingData?.reconnectForceClosedAt ?? null,
    } satisfies EligibleTicketTailorEventDocument,
    { merge: false },
  );
}

/** Persists a per-event reconcile/sync result — see reconcileEventBenefitsForEvent and the admin "Sincronizar" route. */
export async function recordEventBenefitSyncResult(
  ticketTailorEventId: string,
  result: { checked: number; granted: number; errors: number },
): Promise<void> {
  await adminDb.doc(`eligibleTicketTailorEvents/${ticketTailorEventId}`).update({
    lastSyncedAt: new Date(),
    lastSyncResult: result,
  });
}
