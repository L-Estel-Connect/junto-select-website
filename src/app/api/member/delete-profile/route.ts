import { NextResponse } from "next/server";
import { adminAuth, adminDb, getAdminStorageBucket } from "@/lib/firebase/admin";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getStripe } from "@/lib/stripe/client";
import { queueOutboundEmail } from "@/lib/notifications/outboundEmails";
import type { BillingDocument, BillingStatus } from "@/lib/billing/types";

export const runtime = "nodejs";

/**
 * Any billing status where Stripe could still be actively running the
 * subscription (and therefore could still charge it) — a strictly wider
 * set than `isEntitledStatus` (matching eligibility), since a subscription
 * can be non-entitling (e.g. `incomplete`, `unpaid`) and still be a live,
 * chargeable Stripe object. "none", "canceled" and "incomplete_expired"
 * are the only statuses where Stripe has already stopped the subscription
 * on its own.
 */
function isCancelableSubscriptionStatus(status: BillingStatus): boolean {
  return status !== "none" && status !== "canceled" && status !== "incomplete_expired";
}

/**
 * Permanently deletes a member's own account. Every write here uses the
 * Admin SDK, which bypasses firestore.rules/storage.rules the same way the
 * Stripe webhook and matching engine already do (see firestore.rules:
 * `profiles/{uid}` has `allow delete: if false` for CLIENT requests only)
 * — so this route needed no rules change to be safe.
 *
 * Order matters: a live Stripe subscription is canceled FIRST, and the
 * whole request aborts if that fails, because deleting the profile while
 * a subscription keeps renewing would silently charge someone who can no
 * longer receive the service — exactly the outcome this route must never
 * allow. Only once Stripe confirms cancellation do we remove the profile
 * (immediately out of the matching pool), the uploaded photos, and finally
 * the Firebase Auth user itself, so this identity can never sign in again.
 */
export async function POST(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  const billingSnap = await adminDb.doc(`billing/${uid}`).get();
  const billing = billingSnap.exists ? (billingSnap.data() as BillingDocument) : null;

  if (billing?.stripeSubscriptionId && isCancelableSubscriptionStatus(billing.status)) {
    try {
      const stripe = getStripe();
      // `subscriptions.cancel` (no `cancel_at_period_end`) cancels
      // IMMEDIATELY — deliberately never the period-end behavior used by
      // ordinary "Cancelar suscripción" — because the account is about to
      // be permanently deleted, not just stop renewing. The returned
      // object's own `status` is checked, not just that the call didn't
      // throw: that's the actual confirmation that Stripe has stopped the
      // subscription before anything is deleted below.
      const canceled = await stripe.subscriptions.cancel(billing.stripeSubscriptionId);
      if (canceled.status !== "canceled") {
        throw new Error(`Stripe reported unexpected status "${canceled.status}" after cancel`);
      }
    } catch (error) {
      console.error(`delete-profile: failed to confirm subscription cancellation for uid ${uid}`, error);
      return NextResponse.json(
        { ok: false, error: "subscription_cancel_failed" },
        { status: 502 },
      );
    }
  }

  // Captured now, before anything is deleted: once the profile/Auth user
  // are gone below, there is no uid left to resolve an email address
  // from, unlike payment_failed/renewal_reminder which can resolve it
  // lazily at send time. A queueing failure must never abort a deletion
  // the member explicitly requested and already had Stripe safely
  // canceled for — hence the swallowed catch.
  await queueOutboundEmail({ type: "account_deleted", uid: null, email: auth.email, data: {} }).catch(
    (error) => {
      console.error(`delete-profile: failed to queue account_deleted email for uid ${uid}`, error);
    },
  );

  try {
    const bucket = getAdminStorageBucket();
    await bucket.deleteFiles({ prefix: `profiles/${uid}/photos/` });
  } catch (error) {
    // Not fatal — an orphaned photo, inaccessible once the Auth user below
    // is deleted (Storage rules are owner-only), is a lesser harm than
    // aborting a deletion the member explicitly requested and already had
    // its subscription safely canceled for.
    console.error(`delete-profile: failed to delete photos for uid ${uid}`, error);
  }

  await adminDb.doc(`profiles/${uid}`).delete();
  await adminDb.doc(`users/${uid}`).delete();

  // billing/{uid} is marked rather than deleted: it's the only durable
  // record of what was charged, and deleting it risks a later, already
  // in-flight Stripe webhook event re-creating a bare doc for this uid via
  // its own `.set(..., { merge: true })`. Marking it is a plain write, not
  // new "billing entitlement logic" — nothing here changes how any status
  // is computed or acted on.
  if (billingSnap.exists) {
    await adminDb.doc(`billing/${uid}`).set(
      { profileDeleted: true, deletedAt: new Date() },
      { merge: true },
    );
  }

  await adminAuth.deleteUser(uid);

  return NextResponse.json({ ok: true });
}
