import { NextResponse } from "next/server";
import { adminAuth, adminDb, getAdminStorageBucket } from "@/lib/firebase/admin";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getStripe } from "@/lib/stripe/client";
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
      await stripe.subscriptions.cancel(billing.stripeSubscriptionId);
    } catch (error) {
      console.error(`delete-profile: failed to cancel subscription for uid ${uid}`, error);
      return NextResponse.json(
        { ok: false, error: "subscription_cancel_failed" },
        { status: 502 },
      );
    }
  }

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
