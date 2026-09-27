import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { BillingDocument } from "@/lib/billing/types";
import { getTicketTailorClient } from "@/lib/ticketTailor/client";
import { generateUniqueEventBenefitCode } from "./codeGeneration";
import { eventEndOfDayMadrid, isEventUpcoming, isMemberEligibleForEvent } from "./eligibility";
import { listEligibleEvents } from "./eligibleEvents";
import type {
  AdminEventBenefitView,
  EligibleTicketTailorEventDocument,
  EventBenefitDocument,
  MemberEventBenefitView,
} from "./types";

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const t = value as { toDate?: () => Date } | null | undefined;
  return t?.toDate ? t.toDate() : null;
}

/**
 * `eventBenefits/{uid}_{ticketTailorEventId}` — the doc ID IS the
 * idempotency key for one (member, event) pair, for the lifetime of that
 * pair. See EventBenefitDocument's doc comment for why this replaces the
 * old `{subscriptionId}:{periodIndex}` billing-cycle key.
 */
function benefitDocId(uid: string, ticketTailorEventId: string): string {
  return `${uid}_${ticketTailorEventId}`;
}

/**
 * The member-facing read path — see /api/member/event-benefit. Returns
 * every non-invalidated benefit this member currently has, one per
 * eligible event, joined against that event's label/date/checkout URL so
 * PlanSection.tsx never has to fetch the eligible-events registry itself
 * (which has no legitimate client read path — see
 * EligibleTicketTailorEventDocument's doc comment). Invalidated benefits
 * are never returned to the member — showing a dead code was rejected in
 * the architecture review the same way showing a fabricated "used" state
 * was.
 */
export async function listEventBenefitsForMember(uid: string): Promise<MemberEventBenefitView[]> {
  const snap = await adminDb.collection("eventBenefits").where("uid", "==", uid).get();
  const benefits = snap.docs.map((d) => d.data() as EventBenefitDocument).filter((b) => b.status !== "invalidated");
  if (benefits.length === 0) return [];

  const eventById = await loadEventsByIds(benefits.map((b) => b.ticketTailorEventId));

  return benefits
    .map((b) => {
      const event = eventById.get(b.ticketTailorEventId);
      const ready = b.status === "active";
      return {
        ticketTailorEventId: b.ticketTailorEventId,
        eventLabel: event?.label ?? "Evento Junto Select",
        eventDate: event?.eventDate ?? null,
        checkoutUrl: event?.ticketTailorCheckoutUrl ?? null,
        ready,
        code: ready ? b.code : null,
        percentage: b.percentage,
        validUntil: ready ? b.validUntil : null,
      } satisfies MemberEventBenefitView;
    })
    .sort((a, c) => (a.eventDate ?? "").localeCompare(c.eventDate ?? ""));
}

/**
 * The admin per-member read path — see the member-detail page. Unlike the
 * member-facing view, nothing is filtered or masked: invalidated benefits
 * are shown as their own state ("expirado/invalidado"), and the real code
 * is always included, since this is already behind admin auth.
 */
export async function listEventBenefitsForAdmin(uid: string): Promise<AdminEventBenefitView[]> {
  const snap = await adminDb.collection("eventBenefits").where("uid", "==", uid).get();
  const benefits = snap.docs.map((d) => d.data() as EventBenefitDocument);
  if (benefits.length === 0) return [];

  const eventById = await loadEventsByIds(benefits.map((b) => b.ticketTailorEventId));

  return benefits
    .map((b) => {
      const event = eventById.get(b.ticketTailorEventId);
      return {
        ticketTailorEventId: b.ticketTailorEventId,
        eventLabel: event?.label ?? "Evento eliminado",
        eventDate: event?.eventDate ?? null,
        status: b.status,
        code: b.code,
        validUntil: b.validUntil,
        invalidatedReason: b.invalidatedReason,
      } satisfies AdminEventBenefitView;
    })
    .sort((a, c) => (a.eventDate ?? "").localeCompare(c.eventDate ?? ""));
}

async function loadEventsByIds(ticketTailorEventIds: string[]): Promise<Map<string, EligibleTicketTailorEventDocument>> {
  const ids = [...new Set(ticketTailorEventIds)];
  const snaps = await adminDb.getAll(...ids.map((id) => adminDb.doc(`eligibleTicketTailorEvents/${id}`)));
  const byId = new Map<string, EligibleTicketTailorEventDocument>();
  snaps.forEach((s) => {
    if (s.exists) byId.set(s.id, s.data() as EligibleTicketTailorEventDocument);
  });
  return byId;
}

/** How many (member, event) benefit docs exist for this one event — admin visibility only, see the event-benefits admin page. */
export async function countEventBenefitsForEvent(ticketTailorEventId: string): Promise<number> {
  const snap = await adminDb.collection("eventBenefits").where("ticketTailorEventId", "==", ticketTailorEventId).count().get();
  return snap.data().count;
}

/**
 * Real entitlement loss (active/trialing/past_due -> anything else) —
 * invalidate every NOT-YET-OCCURRED benefit for this member. Unlike the
 * old billing-cycle model's "at most one active benefit," a member can now
 * hold several benefits at once (one per still-upcoming eligible event),
 * so this may touch more than one doc. A benefit for an event that has
 * ALREADY happened is left untouched either way — it's moot, not wrong.
 * Best-effort on the Ticket Tailor side; the Firestore-side status flip is
 * always authoritative regardless of whether the external call succeeds.
 * Idempotent: called again with nothing left to invalidate is a no-op.
 */
export async function invalidateUpcomingEventBenefitsForMember(uid: string, now: Date = new Date()): Promise<void> {
  const snap = await adminDb
    .collection("eventBenefits")
    .where("uid", "==", uid)
    .where("status", "in", ["pending_external", "active", "external_sync_failed"])
    .get();
  if (snap.empty) return;

  const benefits = snap.docs.map((d) => ({ ref: d.ref, data: d.data() as EventBenefitDocument }));
  const eventById = await loadEventsByIds(benefits.map((b) => b.data.ticketTailorEventId));

  for (const { ref, data: benefit } of benefits) {
    const eventDate = eventById.get(benefit.ticketTailorEventId)?.eventDate ?? null;
    // Only skip when we have concrete evidence the event already happened
    // — an unknown/missing event date falls through and gets invalidated,
    // which is the safe default.
    if (eventDate && !isEventUpcoming(eventDate, now)) continue;

    if (benefit.ticketTailorDiscountId) {
      try {
        await getTicketTailorClient().invalidateDiscount(benefit.ticketTailorDiscountId);
      } catch (error) {
        console.error(
          `invalidateUpcomingEventBenefitsForMember: Ticket Tailor invalidation failed for uid ${uid}, event ${benefit.ticketTailorEventId}`,
          error,
        );
      }
    }
    await ref.update({ status: "invalidated", invalidatedAt: now, invalidatedReason: "membership_lapsed" });
  }
}

export interface EventReconcileResult {
  checked: number;
  granted: number;
  errors: number;
}

/**
 * Grants THIS ONE event's benefit to every currently-entitled member who
 * qualifies (isMemberEligibleForEvent) and doesn't already have a benefit
 * doc for this event. Safe to call as often as you like — from the
 * scheduler (looping over every eligible upcoming event) or from the
 * admin "Sincronizar" button (one event, on demand): the deterministic
 * `{uid}_{eventId}` doc id makes re-granting an existing pair structurally
 * impossible, and `findDiscountByCode` closes the one gap Firestore's own
 * atomicity can't cover (a Ticket Tailor call that succeeds right before a
 * crash) — the same idempotency strategy the old billing-cycle scan used,
 * just re-keyed to (member, event) instead of (subscription, period).
 */
export async function reconcileEventBenefitsForEvent(
  event: EligibleTicketTailorEventDocument,
  now: Date = new Date(),
): Promise<EventReconcileResult> {
  const result: EventReconcileResult = { checked: 0, granted: 0, errors: 0 };
  if (event.memberBenefitEnabled === false) return result;
  if (!event.eventDate || !isEventUpcoming(event.eventDate, now)) return result;

  const entitledSnap = await adminDb.collection("billing").where("status", "in", ["active", "trialing", "past_due"]).get();

  for (const doc of entitledSnap.docs) {
    const uid = doc.id;
    const billing = doc.data() as BillingDocument;
    if (!isMemberEligibleForEvent(billing, event.eventDate)) continue;
    result.checked += 1;
    try {
      const granted = await grantEventBenefit(uid, billing, event, now);
      if (granted) result.granted += 1;
    } catch (error) {
      console.error(`reconcileEventBenefitsForEvent: uid ${uid}, event ${event.ticketTailorEventId} failed`, error);
      result.errors += 1;
    }
  }

  return result;
}

/** Returns true only when a NEW benefit was actively granted this call — false for an already-settled (active/invalidated) pair, so callers can distinguish "nothing to do" from "just granted." */
async function grantEventBenefit(
  uid: string,
  billing: BillingDocument,
  event: EligibleTicketTailorEventDocument,
  now: Date,
): Promise<boolean> {
  const ref = adminDb.doc(`eventBenefits/${benefitDocId(uid, event.ticketTailorEventId)}`);
  let snap = await ref.get();

  if (!snap.exists) {
    const code = await generateUniqueEventBenefitCode();
    const validUntil = eventEndOfDayMadrid(event.eventDate as string);
    const newDoc: EventBenefitDocument = {
      uid,
      ticketTailorEventId: event.ticketTailorEventId,
      stripeSubscriptionId: billing.stripeSubscriptionId,
      createdAt: now,
      validUntil,
      percentage: 20,
      ticketTailorDiscountId: null,
      code,
      status: "pending_external",
      invalidatedAt: null,
      invalidatedReason: null,
    };
    try {
      await ref.create(newDoc);
    } catch {
      // Lost a race to a concurrent/overlapping reconcile claiming the
      // same (member, event) pair — fine, proceed with whatever the
      // winner wrote.
    }
    snap = await ref.get();
  }

  const benefit = snap.data() as EventBenefitDocument;
  if (benefit.status !== "pending_external" && benefit.status !== "external_sync_failed") {
    // Already active or invalidated — nothing left to do, and no reason to
    // re-hit Ticket Tailor for a pair that's already settled.
    return false;
  }

  try {
    const client = getTicketTailorClient();
    const existing = await client.findDiscountByCode(benefit.code);
    const discount =
      existing ??
      (await client.createDiscount({
        code: benefit.code,
        name: `Junto Select – ${event.label}`,
        percentage: benefit.percentage,
        maxRedemptions: 1,
        ticketTypeIds: event.ticketTailorTicketTypeIds,
        expiresAt: toDate(benefit.validUntil) ?? eventEndOfDayMadrid(event.eventDate as string),
      }));
    await ref.update({ ticketTailorDiscountId: discount.id, status: "active" });
    // true whenever THIS call is what activated the benefit — whether the
    // doc was just created above or this is a retry of a previously
    // pending/failed one. Only "already settled before this call" (the
    // early return above) counts as false.
    return true;
  } catch (error) {
    await ref.update({ status: "external_sync_failed" });
    throw error;
  }
}

export interface EventBenefitScanResult {
  eventsChecked: number;
  granted: number;
  errors: number;
}

/**
 * The automatic scheduler entry point — see
 * /api/admin/billing/run-due-event-benefits. Simplest possible idempotent
 * shape, per the approved architecture: (eligible, upcoming events) ×
 * (currently entitled members) → grant any missing (member, event)
 * benefit. This single cross-product is what makes a new member joining,
 * a new event becoming eligible, and a renewal extending
 * `currentPeriodEnd` all "just work" on the next scan pass, with no
 * separate code path for any of the three.
 */
export async function runDueEventBenefitScan(now: Date = new Date()): Promise<EventBenefitScanResult> {
  const events = await listEligibleEvents();
  const upcoming = events.filter(
    (e) => e.memberBenefitEnabled !== false && e.eventDate && isEventUpcoming(e.eventDate, now),
  );

  const result: EventBenefitScanResult = { eventsChecked: upcoming.length, granted: 0, errors: 0 };
  for (const event of upcoming) {
    const eventResult = await reconcileEventBenefitsForEvent(event, now);
    result.granted += eventResult.granted;
    result.errors += eventResult.errors;
  }
  return result;
}
