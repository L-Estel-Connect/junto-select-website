import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { BillingDocument } from "@/lib/billing/types";
import { getTicketTailorClient, STAGING_SIMULATED_DISCOUNT_PREFIX } from "@/lib/ticketTailor/client";
import type { ProfileDocument } from "@/lib/introduction/types";
import { generateUniqueEventBenefitCode } from "./codeGeneration";
import {
  currentBenefitCycle,
  eventEndOfDayMadrid,
  isEventUpcoming,
  isMemberEligibleForEvent,
  type BenefitCycle,
} from "./eligibility";
import { listEligibleEvents } from "./eligibleEvents";
import type {
  AdminEventBenefitView,
  ClaimableEventView,
  EligibleTicketTailorEventDocument,
  EventBenefitCycleDocument,
  EventBenefitDocument,
  MemberEventBenefitState,
  MemberEventBenefitView,
} from "./types";

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const t = value as { toDate?: () => Date } | null | undefined;
  return t?.toDate ? t.toDate() : null;
}

/**
 * THE 20 % MEMBER BENEFIT (monthly-cycle model, replacing the earlier
 * one-code-per-eligible-event engine): every Select member gets ONE
 * personal, single-use 20 % code per monthly cycle, for ONE eligible Junto
 * Select event of their choice — the same rule the public site states.
 * Cycles are calendar months counted from the subscription's start date,
 * whatever the plan length (see currentBenefitCycle). Nothing is issued
 * automatically any more: the member picks the event on their plan page
 * (claimCycleEventBenefit), which is what makes "one per cycle" exact
 * instead of one per event.
 *
 * Record shapes are unchanged — `eventBenefits/{uid}_{ticketTailorEventId}`
 * — so codes issued by the earlier engine, the admin views and the
 * lapse-invalidation below all keep working on old and new codes alike.
 * The new `eventBenefitCycles` lock doc is what enforces one per cycle.
 */
function benefitDocId(uid: string, ticketTailorEventId: string): string {
  return `${uid}_${ticketTailorEventId}`;
}

function cycleDocId(uid: string, stripeSubscriptionId: string, cycleIndex: number): string {
  return `${uid}_${stripeSubscriptionId}_${cycleIndex}`;
}

function toMemberView(b: EventBenefitDocument, event: EligibleTicketTailorEventDocument | undefined): MemberEventBenefitView {
  const ready = b.status === "active";
  return {
    ticketTailorEventId: b.ticketTailorEventId,
    eventLabel: event?.label ?? "Encuentro Junto Select",
    eventDate: event?.eventDate ?? null,
    checkoutUrl: event?.ticketTailorCheckoutUrl ?? null,
    ready,
    state: ready ? "ready" : b.status === "external_sync_failed" ? "failed" : "preparing",
    simulated: !!b.ticketTailorDiscountId?.startsWith(STAGING_SIMULATED_DISCOUNT_PREFIX),
    code: ready ? b.code : null,
    percentage: b.percentage,
    validUntil: ready ? b.validUntil : null,
  };
}

/**
 * The subscription start that anchors the member's monthly cycles:
 * `billing.subscriptionStartedAt` (written by the webhook), or — for
 * billing docs written before that field existed — the profile's matching
 * anchor, which the webhook sets from the same Stripe `start_date`, but
 * only when it belongs to the same subscription. Unknown means no cycle
 * (fail closed) until the next webhook event fills it in.
 */
async function resolveSubscriptionStart(uid: string, billing: BillingDocument): Promise<Date | null> {
  const fromBilling = toDate(billing.subscriptionStartedAt);
  if (fromBilling) return fromBilling;
  const profileSnap = await adminDb.doc(`profiles/${uid}`).get();
  const meta = (profileSnap.data() as ProfileDocument | undefined)?.meta;
  if (meta && billing.stripeSubscriptionId && meta.matchingSubscriptionId === billing.stripeSubscriptionId) {
    return toDate(meta.matchingAnchorAt);
  }
  return null;
}

async function loadBillingAndCycle(
  uid: string,
  now: Date,
): Promise<{ billing: BillingDocument | null; cycle: BenefitCycle | null }> {
  const billingSnap = await adminDb.doc(`billing/${uid}`).get();
  if (!billingSnap.exists) return { billing: null, cycle: null };
  const billing = billingSnap.data() as BillingDocument;
  if (!billing.stripeSubscriptionId) return { billing, cycle: null };
  const start = await resolveSubscriptionStart(uid, billing);
  return { billing, cycle: currentBenefitCycle(billing, start, now) };
}

/** Whether this event can carry a member code at all, independent of who's asking. */
function isBenefitEvent(event: EligibleTicketTailorEventDocument, now: Date): event is EligibleTicketTailorEventDocument & { eventDate: string } {
  return (
    event.memberBenefitEnabled !== false &&
    event.ticketTailorLinked !== false &&
    !event.archivedAt &&
    !!event.eventDate &&
    event.ticketTailorTicketTypeIds.length > 0 &&
    isEventUpcoming(event.eventDate, now)
  );
}

/**
 * The member-facing read path — see /api/member/event-benefit. Returns the
 * current monthly cycle (claimed or not), the events its code can still be
 * requested for, and every non-invalidated code the member holds (codes
 * from the earlier per-event engine included — they stay valid). Joined
 * against each event's label/date/checkout URL so PlanSection.tsx never
 * reads the eligible-events registry itself (it has no client read path).
 * Invalidated codes are never returned — the member never sees a dead code.
 */
export async function getMemberEventBenefitState(uid: string, now: Date = new Date()): Promise<MemberEventBenefitState> {
  const [{ billing, cycle }, benefitSnap] = await Promise.all([
    loadBillingAndCycle(uid, now),
    adminDb.collection("eventBenefits").where("uid", "==", uid).get(),
  ]);
  const held = benefitSnap.docs.map((d) => d.data() as EventBenefitDocument).filter((b) => b.status !== "invalidated");
  const eventById = held.length > 0 ? await loadEventsByIds(held.map((b) => b.ticketTailorEventId)) : new Map();

  const benefits = held
    .map((b) => toMemberView(b, eventById.get(b.ticketTailorEventId)))
    .sort((a, c) => (a.eventDate ?? "").localeCompare(c.eventDate ?? ""));

  if (!billing || !cycle || !billing.stripeSubscriptionId) {
    return { cycle: null, claimableEvents: [], benefits };
  }

  const cycleSnap = await adminDb.doc(`eventBenefitCycles/${cycleDocId(uid, billing.stripeSubscriptionId, cycle.index)}`).get();
  const claimed = cycleSnap.exists ? (cycleSnap.data() as EventBenefitCycleDocument) : null;

  let claimableEvents: ClaimableEventView[] = [];
  if (!claimed) {
    const heldEventIds = new Set(held.map((b) => b.ticketTailorEventId));
    claimableEvents = (await listEligibleEvents())
      .filter((e) => isBenefitEvent(e, now) && isMemberEligibleForEvent(billing, e.eventDate as string))
      .filter((e) => !heldEventIds.has(e.ticketTailorEventId))
      .map((e) => ({ ticketTailorEventId: e.ticketTailorEventId, eventLabel: e.label, eventDate: e.eventDate as string }))
      .sort((a, c) => a.eventDate.localeCompare(c.eventDate));
  }

  return {
    cycle: {
      cycleStart: cycle.start,
      cycleEnd: cycle.end,
      claimed: !!claimed,
      claimedEventId: claimed?.ticketTailorEventId ?? null,
    },
    claimableEvents,
    benefits,
  };
}

export type ClaimError =
  | "no_active_cycle"
  | "cycle_already_claimed"
  | "event_not_eligible"
  | "event_already_has_code"
  | "invalid_request";

export type ClaimResult = { ok: true; benefit: MemberEventBenefitView } | { ok: false; error: ClaimError };

/**
 * The member asks for this cycle's code, for one event. Everything is
 * re-checked server-side (entitlement, the cycle, the event's own
 * eligibility and date against the paid period), and the cycle lock plus
 * the code are written in ONE transaction: two clicks, two tabs or a retry
 * can never produce two codes for the same cycle, or two live codes for
 * the same event. Repeating the same claim returns the existing code.
 * The Ticket Tailor discount (max 1 redemption, expiring the night of the
 * event) is created right after; if that call fails the code stays
 * "being prepared" and retryPendingEventBenefits finishes it.
 */
export async function claimCycleEventBenefit(uid: string, ticketTailorEventId: string, now: Date = new Date()): Promise<ClaimResult> {
  const { billing, cycle } = await loadBillingAndCycle(uid, now);
  if (!billing || !cycle || !billing.stripeSubscriptionId) return { ok: false, error: "no_active_cycle" };
  const subscriptionId = billing.stripeSubscriptionId;

  const eventSnap = await adminDb.doc(`eligibleTicketTailorEvents/${ticketTailorEventId}`).get();
  const event = eventSnap.exists ? (eventSnap.data() as EligibleTicketTailorEventDocument) : null;
  if (!event || !isBenefitEvent(event, now) || !isMemberEligibleForEvent(billing, event.eventDate)) {
    return { ok: false, error: "event_not_eligible" };
  }

  const cycleKey = cycleDocId(uid, subscriptionId, cycle.index);
  const cycleRef = adminDb.doc(`eventBenefitCycles/${cycleKey}`);
  const code = await generateUniqueEventBenefitCode();

  const outcome = await adminDb.runTransaction(async (tx) => {
    const [cycleSnap, sameEventSnap] = await Promise.all([
      tx.get(cycleRef),
      tx.get(adminDb.collection("eventBenefits").where("uid", "==", uid).where("ticketTailorEventId", "==", ticketTailorEventId)),
    ]);
    if (cycleSnap.exists) {
      const lock = cycleSnap.data() as EventBenefitCycleDocument;
      // Same request again (double click, retry): idempotent, not an error.
      if (lock.ticketTailorEventId === ticketTailorEventId) return { kind: "existing" as const, benefitId: lock.eventBenefitId };
      return { kind: "error" as const, error: "cycle_already_claimed" as const };
    }
    const live = sameEventSnap.docs.filter((d) => (d.data() as EventBenefitDocument).status !== "invalidated");
    if (live.length > 0) return { kind: "error" as const, error: "event_already_has_code" as const };

    // A code invalidated earlier (membership lapsed) keeps its record; a
    // new one for the same event gets a cycle-suffixed id beside it.
    const plainId = benefitDocId(uid, ticketTailorEventId);
    const benefitId = sameEventSnap.docs.some((d) => d.id === plainId) ? `${plainId}_${cycle.index}_${subscriptionId}` : plainId;
    const benefit: EventBenefitDocument = {
      uid,
      ticketTailorEventId,
      stripeSubscriptionId: subscriptionId,
      createdAt: now,
      validUntil: eventEndOfDayMadrid(event.eventDate),
      percentage: 20,
      ticketTailorDiscountId: null,
      code,
      status: "pending_external",
      invalidatedAt: null,
      invalidatedReason: null,
      cycleKey,
      cycleStart: cycle.start,
      cycleEnd: cycle.end,
    };
    const lock: EventBenefitCycleDocument = {
      uid,
      stripeSubscriptionId: subscriptionId,
      cycleIndex: cycle.index,
      cycleStart: cycle.start,
      cycleEnd: cycle.end,
      ticketTailorEventId,
      eventBenefitId: benefitId,
      claimedAt: now,
    };
    tx.create(adminDb.doc(`eventBenefits/${benefitId}`), benefit);
    tx.create(cycleRef, lock);
    return { kind: "created" as const, benefitId };
  });

  if (outcome.kind === "error") return { ok: false, error: outcome.error };

  // A new code, or the same request again ("Reintentar") for a code that is
  // not live yet: activation only ever works on this one record and adopts
  // an existing Ticket Tailor discount, so a retry never makes a second code.
  const ref = adminDb.doc(`eventBenefits/${outcome.benefitId}`);
  try {
    await activateEventBenefit(ref, event);
  } catch (error) {
    // Recorded as external_sync_failed; the retry scan finishes it.
    console.error(`claimCycleEventBenefit: Ticket Tailor activation failed for ${outcome.benefitId}`, error);
  }
  const fresh = (await ref.get()).data() as EventBenefitDocument;
  return { ok: true, benefit: toMemberView(fresh, event) };
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
 * invalidate every NOT-YET-OCCURRED benefit for this member. A member can
 * hold more than one live code (this cycle's, an earlier cycle's for a
 * later event, or codes from the earlier per-event engine), so this may
 * touch more than one doc. A benefit for an event that has
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
 * Creates the Ticket Tailor discount for a code that doesn't have one yet
 * (`pending_external` / `external_sync_failed`). Returns true only when
 * THIS call activated it. `findDiscountByCode` first closes the one gap
 * Firestore can't: a create that succeeded right before a crash is
 * adopted, never duplicated.
 */
async function activateEventBenefit(
  ref: FirebaseFirestore.DocumentReference,
  event: EligibleTicketTailorEventDocument,
): Promise<boolean> {
  const benefit = (await ref.get()).data() as EventBenefitDocument;
  if (benefit.status !== "pending_external" && benefit.status !== "external_sync_failed") return false;

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
    return true;
  } catch (error) {
    await ref.update({ status: "external_sync_failed" });
    throw error;
  }
}

/**
 * Finishes codes that were claimed but whose Ticket Tailor discount isn't
 * live yet, for one event (the admin "Sincronizar" button) or for every
 * event (the scheduled scan). Never issues a new code: under the monthly
 * model only the member's own claim does that. Codes for events that have
 * already happened are left alone.
 */
export async function retryPendingEventBenefits(
  onlyEventId: string | null = null,
  now: Date = new Date(),
): Promise<EventReconcileResult> {
  let query = adminDb.collection("eventBenefits").where("status", "in", ["pending_external", "external_sync_failed"]);
  if (onlyEventId) query = query.where("ticketTailorEventId", "==", onlyEventId);
  const snap = await query.get();

  const result: EventReconcileResult = { checked: 0, granted: 0, errors: 0 };
  if (snap.empty) return result;
  const eventById = await loadEventsByIds(snap.docs.map((d) => (d.data() as EventBenefitDocument).ticketTailorEventId));

  for (const doc of snap.docs) {
    const event = eventById.get((doc.data() as EventBenefitDocument).ticketTailorEventId);
    if (!event?.eventDate || !isEventUpcoming(event.eventDate, now)) continue;
    result.checked += 1;
    try {
      if (await activateEventBenefit(doc.ref, event)) result.granted += 1;
    } catch (error) {
      console.error(`retryPendingEventBenefits: ${doc.id} failed`, error);
      result.errors += 1;
    }
  }
  return result;
}

export interface EventBenefitScanResult {
  eventsChecked: number;
  granted: number;
  errors: number;
}

/**
 * The scheduler entry point — see /api/admin/billing/run-due-event-benefits.
 * Under the monthly-cycle model this only retries pending Ticket Tailor
 * activations; it no longer grants a code per (member, event).
 */
export async function runDueEventBenefitScan(now: Date = new Date()): Promise<EventBenefitScanResult> {
  const result = await retryPendingEventBenefits(null, now);
  return { eventsChecked: result.checked, granted: result.granted, errors: result.errors };
}
