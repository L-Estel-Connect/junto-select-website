import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { adminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe/client";
import { planKeyForPriceId } from "@/lib/stripe/plans";
import { isEntitledStatus, type BillingDocument, type BillingStatus } from "@/lib/billing/types";
import { matchingPeriodDate } from "@/lib/matching/config";
import { queueOutboundEmail } from "@/lib/notifications/outboundEmails";
import type { ProfileDocument } from "@/lib/introduction/types";
import { computeEventBenefitAnchorUpdate, invalidateCurrentEventBenefitForMember } from "@/lib/eventBenefits/lifecycle";

export const runtime = "nodejs";

/**
 * Stripe is the source of truth for membership entitlement — this webhook
 * is the ONLY place that ever writes `billing/{uid}` or
 * `profiles/{uid}.meta.searchStatus`. Nothing else (checkout-session
 * creation, the return-from-checkout page, any client code) sets either,
 * which is what makes "never trust `success_url`" an enforced property:
 * even if a member is redirected to the success URL, their membership
 * shows as active only once this handler has processed a real, verified
 * event from Stripe.
 *
 * Every event is signature-verified before anything is parsed as JSON, and
 * de-duplicated by Stripe's event id (`processedStripeEvents/{id}`) before
 * being acted on, since Stripe's delivery is at-least-once and the same
 * event can arrive more than once (a retried delivery, or a genuine
 * duplicate). Every write below also happens to be naturally idempotent on
 * its own — it always sets the FULL current state read from Stripe, never
 * increments/appends anything — so even a very rare race between two
 * near-simultaneous deliveries of the same event just re-writes the same
 * value, not a corrupted one.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("Stripe webhook: STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
  }
  if (!signature) {
    return NextResponse.json({ ok: false, error: "missing_signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  let stripe;
  try {
    stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook: signature verification failed", err);
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }

  const eventRef = adminDb.doc(`processedStripeEvents/${event.id}`);
  const alreadyProcessed = await eventRef.get();
  if (alreadyProcessed.exists) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  try {
    await handleEvent(stripe, event);
  } catch (err) {
    console.error(`Stripe webhook: failed to process event ${event.id} (${event.type})`, err);
    // A non-200 response tells Stripe to retry — safe, since our handlers
    // are idempotent (see file comment above).
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 500 });
  }

  await eventRef.set({ type: event.type, processedAt: new Date() });
  return NextResponse.json({ ok: true });
}

async function handleEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === "string") {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await syncSubscription(subscription);
      }
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await syncSubscription(subscription);
      return;
    }
    case "invoice.payment_failed":
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionRef = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
      if (!subscriptionId) return;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const uid = await resolveUid(subscription);
      if (!uid) return;
      await adminDb.doc(`billing/${uid}`).set(
        {
          lastPaymentFailedAt: event.type === "invoice.payment_failed" ? new Date() : null,
          updatedAt: new Date(),
        },
        { merge: true },
      );
      if (event.type === "invoice.payment_failed") {
        // Best-effort: a member whose renewal payment failed should be
        // told, so they don't silently lose access days later with no
        // warning (see the operational audit — no sender is wired up
        // yet, this just makes sure the event isn't lost once one is).
        // Never allowed to affect the webhook's own success/failure.
        await queueOutboundEmail({
          type: "payment_failed",
          uid,
          email: null,
          data: { subscriptionId: subscription.id },
        }).catch((error) => {
          console.error(`Stripe webhook: failed to queue payment_failed email for uid ${uid}`, error);
        });
      }
      // The subscription's own `status` (past_due / active / unpaid /
      // canceled) is what actually drives searchStatus — Stripe's own
      // dunning/retry configuration decides how status evolves after a
      // failed payment, never a custom state machine here.
      await syncSubscription(subscription);
      return;
    }
    default:
      // Every other event type is intentionally unhandled — subscribing
      // to only the events actually needed, per spec.
      return;
  }
}

function subscriptionUid(subscription: Stripe.Subscription): string | null {
  return typeof subscription.metadata?.firebaseUid === "string" ? subscription.metadata.firebaseUid : null;
}

async function findUidForCustomer(customerId: string): Promise<string | null> {
  const snap = await adminDb.collection("billing").where("stripeCustomerId", "==", customerId).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

/**
 * Every subscription created by `create-checkout-session` is tagged with
 * `metadata.firebaseUid` (via `subscription_data.metadata`), so this is
 * the normal path. The customer-id lookup is a defensive fallback only —
 * e.g. a subscription created directly in the Stripe Dashboard for testing
 * without that metadata — never relied on as the primary mechanism.
 */
async function resolveUid(subscription: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = subscriptionUid(subscription);
  if (fromMetadata) return fromMetadata;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  return findUidForCustomer(customerId);
}

function mapStripeStatus(status: Stripe.Subscription.Status): BillingStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    case "unpaid":
      return "unpaid";
    case "canceled":
    case "paused":
    default:
      return "canceled";
  }
}

async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const uid = await resolveUid(subscription);
  if (!uid) {
    console.error(`Stripe webhook: could not resolve a Firebase uid for subscription ${subscription.id}`);
    return;
  }

  const item = subscription.items.data[0];
  const priceId = item ? (typeof item.price === "string" ? item.price : item.price.id) : null;
  const status = mapStripeStatus(subscription.status);
  const now = new Date();

  const billingRef = adminDb.doc(`billing/${uid}`);
  const previousBillingSnap = await billingRef.get();
  const previousBilling = previousBillingSnap.exists ? (previousBillingSnap.data() as BillingDocument) : null;
  const wasEntitled = previousBilling ? isEntitledStatus(previousBilling.status) : false;

  // Event benefit (Ticket Tailor monthly discount) anchor — seeded the
  // same "first time we see this subscription id" way as the matching
  // anchor below, but into billing/{uid} with its own dedicated fields
  // (see computeEventBenefitAnchorUpdate's doc comment for why it's kept
  // separate from matching's anchor rather than reusing it).
  const eventBenefitAnchorUpdate =
    typeof subscription.start_date === "number"
      ? computeEventBenefitAnchorUpdate(previousBilling?.eventBenefitSubscriptionId ?? null, {
          id: subscription.id,
          start_date: subscription.start_date,
        })
      : null;

  await billingRef.set(
    {
      stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      stripeSubscriptionId: subscription.id,
      status,
      planKey: priceId ? planKeyForPriceId(priceId) : null,
      currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      updatedAt: now,
      ...(eventBenefitAnchorUpdate ?? {}),
    } satisfies Partial<BillingDocument>,
    { merge: true },
  );

  // Entitlement genuinely ended (active/trialing/past_due -> anything
  // else) — invalidate whatever event benefit is currently active. Never
  // the reverse direction: staying entitled (including past_due, which
  // IS entitled) never touches the event benefit here at all. Best-effort
  // and isolated from the rest of this handler's success/failure, exactly
  // like the matching-anchor block below.
  if (wasEntitled && !isEntitledStatus(status)) {
    await invalidateCurrentEventBenefitForMember(uid).catch((error) => {
      console.error(`Stripe webhook: failed to invalidate event benefit for uid ${uid}`, error);
    });
  }

  // BILLING ENTITLEMENT vs MATCHING ELIGIBILITY: this is the ONLY thing a
  // payment event is ever allowed to influence. It flips whether this
  // member's own monthly cycle runs at all (`searchStatus`) — it can never
  // set `meta.profileStatus` (profile completeness), never touch
  // `meta.duplicateStatus`, and never bypass `isProfileInEligiblePool`'s
  // own independent Madrid/market checks. A member who pays but has an
  // incomplete or ineligible profile still receives zero proposals,
  // because `loadEligiblePool()` in the matching engine filters on THOSE
  // fields separately, upstream of this one.
  const profileRef = adminDb.doc(`profiles/${uid}`);
  const update: Record<string, unknown> = {
    "meta.searchStatus": isEntitledStatus(status) ? "active_search" : "passive",
    "meta.updatedAt": now,
  };

  // Per-member matching-cycle anchor: only (re)initialized the first time
  // THIS subscription id is seen — a renewal/status update on an ONGOING
  // subscription must never reset it (that would restart the member's
  // matching clock every time Stripe fires an event). A genuinely NEW
  // subscription id (first-ever signup, or a resubscription after full
  // cancellation) correctly starts a fresh matching clock from this
  // subscription's own start date — never from the calendar, never from
  // "now" on a later event. `matchingPeriodsProcessed` resets to 0
  // (period 0's due date = the anchor itself), which is what makes the
  // member's first matching period begin as soon as they're
  // active_search, without waiting for anything else to trigger it — the
  // due-matching scan (dueScheduler.ts) picks them up on its very next
  // run, the same mechanism that serves every later period too.
  try {
    const profileSnap = await profileRef.get();
    const existingSubscriptionId = (profileSnap.data() as ProfileDocument | undefined)?.meta
      ?.matchingSubscriptionId;
    // `start_date` is always present on a real Stripe subscription object;
    // guarded anyway so a malformed/partial event can never write an
    // Invalid Date into `matchingAnchorAt` — which would fail the ENTIRE
    // `profileRef.update(update)` call below (Firestore rejects invalid
    // Date values), silently taking `meta.searchStatus` down with it.
    if (existingSubscriptionId !== subscription.id && typeof subscription.start_date === "number") {
      const anchor = new Date(subscription.start_date * 1000);
      update["meta.matchingAnchorAt"] = anchor;
      update["meta.matchingSubscriptionId"] = subscription.id;
      update["meta.matchingPeriodsProcessed"] = 0;
      update["meta.nextMatchingDueAt"] = matchingPeriodDate(anchor, 0);
    }
  } catch (error) {
    // Never let a failure to read the existing anchor block the billing
    // sync itself — worst case, the anchor stays unset until the next
    // webhook event for this subscription retries this check.
    console.error(`Stripe webhook: failed to check matching anchor for uid ${uid}`, error);
  }

  await profileRef.update(update).catch((err) => {
    console.error(`Stripe webhook: failed to update profile state for uid ${uid}`, err);
  });
}
