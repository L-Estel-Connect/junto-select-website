import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { isEntitledStatus, type BillingDocument } from "@/lib/billing/types";
import { getTicketTailorClient } from "@/lib/ticketTailor/client";
import { getAllEligibleTicketTypeIds } from "./eligibleEvents";
import { generateUniqueEventBenefitCode } from "./codeGeneration";
import { eventBenefitCycleKey, eventBenefitPeriodDate } from "./anchor";
import type { EventBenefitDocument, MemberEventBenefitView } from "./types";

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

/**
 * Called from the Stripe webhook's syncSubscription, the SAME place the
 * matching anchor (matchingAnchorAt/matchingPeriodsProcessed/
 * nextMatchingDueAt) is seeded — but writing to `billing/{uid}` instead of
 * `profiles/{uid}.meta`, and using its own dedicated field names, exactly
 * so the event benefit's monthly lifecycle is never coupled to matching's.
 * Returns `null` when no change is needed (same subscription already
 * anchored — a routine status update, not a new/resubscribed
 * subscription), so the caller can decide whether to include these
 * fields in its own Firestore write rather than issuing a second one.
 */
export function computeEventBenefitAnchorUpdate(
  existingSubscriptionId: string | null,
  subscription: { id: string; start_date: number },
): Partial<BillingDocument> | null {
  if (existingSubscriptionId === subscription.id) return null;
  if (typeof subscription.start_date !== "number") return null;
  const anchor = new Date(subscription.start_date * 1000);
  return {
    eventBenefitAnchorAt: anchor,
    eventBenefitSubscriptionId: subscription.id,
    eventBenefitPeriodsIssued: 0,
    nextEventBenefitDueAt: eventBenefitPeriodDate(anchor, 0),
  } satisfies Partial<BillingDocument>;
}

/**
 * The member-facing read path — see /api/member/event-benefit. Deliberately
 * the ONLY thing the client ever learns: never the full eventBenefits
 * history, never ticketTailorDiscountId (internal bookkeeping), never
 * another member's record (the query is uid-scoped, and Firestore rules
 * independently enforce the same boundary for defense in depth).
 */
export async function getCurrentEventBenefitForMember(uid: string): Promise<MemberEventBenefitView | null> {
  const snap = await adminDb.collection("eventBenefits").where("uid", "==", uid).where("status", "==", "active").limit(1).get();
  if (snap.empty) return null;
  const data = snap.docs[0].data() as EventBenefitDocument;
  return { code: data.code, percentage: data.percentage, validUntil: data.validUntil };
}

/**
 * Membership genuinely lost entitlement (active/trialing/past_due ->
 * canceled/unpaid/incomplete/etc.) — invalidate whatever is currently
 * active for this uid, if anything. Best-effort on the Ticket Tailor
 * side: a failure there is logged and swallowed, never allowed to stop
 * the Firestore-side invalidation (the member must stop seeing/using this
 * code in the Junto UI regardless of whether the external call succeeded)
 * — the audit trail (`invalidatedReason`) always reflects Junto's own,
 * authoritative decision, independent of Ticket Tailor's availability.
 * Idempotent: called again with nothing currently active is a no-op.
 */
export async function invalidateCurrentEventBenefitForMember(uid: string): Promise<void> {
  const snap = await adminDb.collection("eventBenefits").where("uid", "==", uid).where("status", "==", "active").limit(1).get();
  if (snap.empty) return;
  const doc = snap.docs[0];
  const data = doc.data() as EventBenefitDocument;

  if (data.ticketTailorDiscountId) {
    try {
      await getTicketTailorClient().invalidateDiscount(data.ticketTailorDiscountId);
    } catch (error) {
      console.error(`invalidateCurrentEventBenefitForMember: Ticket Tailor invalidation failed for uid ${uid}`, error);
    }
  }

  await doc.ref.update({
    status: "invalidated",
    invalidatedAt: new Date(),
    invalidatedReason: "membership_lapsed",
  });
}

export interface EventBenefitScanResult {
  membersDue: number;
  granted: number;
  retryPending: number;
  skippedNotEntitled: number;
  errors: number;
}

const DUE_SCAN_BATCH_SIZE = 500;

/**
 * The automatic monthly event-benefit scheduler — the event-benefit
 * counterpart to dueScheduler.ts's runDueMatchingScan, following the same
 * proven shape: find everyone whose next period is due, advance exactly
 * ONE period per due member per call, leave anyone not fully completed
 * "due" so the next scan retries them, never skip and never double-grant.
 *
 * IDEMPOTENCY / EXTERNAL-SIDE-EFFECT STRATEGY (see also the final report):
 * 1. The Firestore record for a cycle is claimed via `.create()` on a
 *    DETERMINISTIC doc id (`{stripeSubscriptionId}:{periodIndex}`) —
 *    this alone makes "the same cycle is claimed twice" structurally
 *    impossible: a second `.create()` on the same id always fails.
 * 2. The one thing Firestore's own atomicity CANNOT cover is the
 *    Ticket-Tailor-side mutation itself (an external HTTP call can
 *    succeed while the process crashes before recording that success).
 *    To close that window without relying on any unconfirmed Ticket
 *    Tailor idempotency-key support: before ever calling
 *    `createDiscount`, this always calls `findDiscountByCode` first for
 *    this cycle's own already-known, already-unique `code` — if Ticket
 *    Tailor already has a discount with that code (a prior attempt that
 *    crashed after succeeding externally but before Firestore recorded
 *    it), that discount's id is adopted instead of creating a second
 *    one. This makes external creation genuinely idempotent from Junto's
 *    side regardless of how many times a given cycle's grant is retried.
 * 3. `billing/{uid}`'s own `nextEventBenefitDueAt`/`eventBenefitPeriodsIssued`
 *    are only ever advanced AFTER the benefit doc reaches `status:
 *    "active"` — so a crash at any earlier point simply leaves the
 *    member "due" at the same period, safely retried next scan.
 */
export async function runDueEventBenefitScan(now: Date = new Date()): Promise<EventBenefitScanResult> {
  const snap = await adminDb.collection("billing").where("nextEventBenefitDueAt", "<=", now).limit(DUE_SCAN_BATCH_SIZE).get();

  const result: EventBenefitScanResult = {
    membersDue: snap.size,
    granted: 0,
    retryPending: 0,
    skippedNotEntitled: 0,
    errors: 0,
  };

  for (const billingDoc of snap.docs) {
    const uid = billingDoc.id;
    try {
      const outcome = await processDueMember(uid, billingDoc.data() as BillingDocument, now);
      if (outcome === "granted") result.granted += 1;
      else if (outcome === "skipped_not_entitled") result.skippedNotEntitled += 1;
      else result.retryPending += 1;
    } catch (error) {
      console.error(`runDueEventBenefitScan: uid ${uid} failed`, error);
      result.errors += 1;
    }
  }

  return result;
}

type ProcessOutcome = "granted" | "skipped_not_entitled" | "retry_pending";

async function processDueMember(uid: string, billing: BillingDocument, now: Date): Promise<ProcessOutcome> {
  if (!isEntitledStatus(billing.status)) {
    // No longer entitled — stop scheduling; the webhook's own
    // entitled->not-entitled transition (invalidateCurrentEventBenefitForMember)
    // is what actually invalidates any still-active benefit, not this scan.
    await adminDb.doc(`billing/${uid}`).update({ nextEventBenefitDueAt: null });
    return "skipped_not_entitled";
  }

  const anchor = toDate(billing.eventBenefitAnchorAt);
  const subscriptionId = billing.eventBenefitSubscriptionId;
  if (!anchor || !subscriptionId) {
    // Shouldn't happen given the query (both are seeded together by the
    // webhook) — never crash the whole scan over one malformed doc.
    return "retry_pending";
  }

  const periodIndex = billing.eventBenefitPeriodsIssued ?? 0;
  const cycleKey = eventBenefitCycleKey(subscriptionId, periodIndex);
  const benefitRef = adminDb.doc(`eventBenefits/${cycleKey}`);

  let benefitSnap = await benefitRef.get();
  if (!benefitSnap.exists) {
    const code = await generateUniqueEventBenefitCode();
    const validFrom = eventBenefitPeriodDate(anchor, periodIndex);
    const validUntil = eventBenefitPeriodDate(anchor, periodIndex + 1);
    const newDoc: EventBenefitDocument = {
      uid,
      stripeCustomerId: billing.stripeCustomerId,
      stripeSubscriptionId: subscriptionId,
      cycleKey,
      periodIndex,
      createdAt: now,
      validFrom,
      validUntil,
      percentage: 20,
      ticketTailorDiscountId: null,
      code,
      status: "pending_external",
      invalidatedAt: null,
      invalidatedReason: null,
    };
    try {
      await benefitRef.create(newDoc);
    } catch {
      // Lost a race to a concurrent/overlapping scan claiming the same
      // cycle — fine, just proceed with whatever the winner wrote.
    }
    benefitSnap = await benefitRef.get();
  }

  let benefit = benefitSnap.data() as EventBenefitDocument;

  if (benefit.status === "pending_external" || benefit.status === "external_sync_failed") {
    try {
      const client = getTicketTailorClient();
      const ticketTypeIds = await getAllEligibleTicketTypeIds();
      const existing = await client.findDiscountByCode(benefit.code);
      const discount =
        existing ??
        (await client.createDiscount({
          code: benefit.code,
          name: `Junto Select – ${benefit.code}`,
          percentage: benefit.percentage,
          maxRedemptions: 1,
          ticketTypeIds,
          expiresAt: toDate(benefit.validUntil) ?? now,
        }));
      await benefitRef.update({ ticketTailorDiscountId: discount.id, status: "active" });
      benefit = { ...benefit, ticketTailorDiscountId: discount.id, status: "active" };
    } catch (error) {
      console.error(`processDueMember: Ticket Tailor create failed for uid ${uid}, cycle ${cycleKey}`, error);
      await benefitRef.update({ status: "external_sync_failed" });
      return "retry_pending";
    }
  }

  // Supersede the previous cycle's benefit, if this isn't the first.
  if (periodIndex > 0) {
    const previousRef = adminDb.doc(`eventBenefits/${eventBenefitCycleKey(subscriptionId, periodIndex - 1)}`);
    const previousSnap = await previousRef.get();
    if (previousSnap.exists) {
      const previous = previousSnap.data() as EventBenefitDocument;
      if (previous.status === "active") {
        // Routine monthly supersession relies solely on the previous
        // discount's own `expires` (set at creation time to exactly this
        // cycle boundary) — no DELETE call here. Ticket Tailor's
        // documented DELETE is reserved exclusively for a genuine
        // entitled -> non-entitled transition (see
        // invalidateCurrentEventBenefitForMember); calling it here would
        // permanently destroy the discount, which is unnecessary when
        // expiry already does the job and is explicitly out of scope for
        // routine supersession.
        await previousRef.update({ status: "superseded", invalidatedAt: now, invalidatedReason: "superseded" });
      }
    }
  }

  await adminDb.doc(`billing/${uid}`).update({
    eventBenefitPeriodsIssued: periodIndex + 1,
    nextEventBenefitDueAt: toDate(benefit.validUntil) ?? eventBenefitPeriodDate(anchor, periodIndex + 1),
  });

  return "granted";
}
