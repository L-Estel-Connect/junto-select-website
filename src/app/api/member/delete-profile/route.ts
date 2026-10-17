import { NextResponse } from "next/server";
import Stripe from "stripe";
import { adminAuth, adminDb, getAdminStorageBucket } from "@/lib/firebase/admin";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getStripe } from "@/lib/stripe/client";
import { queueOutboundEmail } from "@/lib/notifications/outboundEmails";
import type { BillingDocument, BillingStatus } from "@/lib/billing/types";
import { removeCandidateFromShortlists } from "@/lib/clients/shortlist";
import { CANDIDATE_LOCATIONS } from "@/lib/clients/locations";

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
 * Stops this account's own Stripe subscription before anything is deleted,
 * and reports whether it is safe to go on. "Safe" means Stripe has
 * confirmed there is nothing left that could charge this person:
 *
 * - the subscription is canceled now (and Stripe confirms it), or
 * - Stripe says it is already canceled/expired, or
 * - Stripe has no such subscription for this key (`resource_missing`).
 *   That is the case for accounts that subscribed in Stripe TEST mode
 *   before the switch to live (30 Sep 2026): their `billing/{uid}` still
 *   says `active` with a test-mode id the live key can't see, and no live
 *   charge can ever come from it. Previously this aborted the deletion,
 *   so those accounts could never be deleted.
 *
 * Any other Stripe failure (network, auth, a live subscription that won't
 * cancel) still blocks the deletion, because deleting a profile while a
 * real subscription keeps renewing would charge someone who can no longer
 * receive the service. Only the subscription id stored on THIS uid's own
 * billing doc is ever touched — never anyone else's.
 */
async function stopSubscription(uid: string, subscriptionId: string): Promise<boolean> {
  const stripe = getStripe();
  try {
    const current = await stripe.subscriptions.retrieve(subscriptionId);
    if (current.status === "canceled" || current.status === "incomplete_expired") return true;
    // `subscriptions.cancel` (no `cancel_at_period_end`) cancels
    // IMMEDIATELY — deliberately never the period-end behavior used by
    // ordinary "Cancelar suscripción" — because the account is about to
    // be permanently deleted, not just stop renewing.
    const canceled = await stripe.subscriptions.cancel(subscriptionId);
    if (canceled.status !== "canceled") {
      throw new Error(`Stripe reported unexpected status "${canceled.status}" after cancel`);
    }
    return true;
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing") {
      console.warn(
        `delete-profile: subscription ${subscriptionId} for uid ${uid} does not exist for this Stripe key (test-mode leftover); nothing to cancel`,
      );
      return true;
    }
    console.error(`delete-profile: failed to confirm subscription cancellation for uid ${uid}`, error);
    return false;
  }
}

/**
 * Permanently deletes a member's own account. Every write here uses the
 * Admin SDK, which bypasses firestore.rules/storage.rules the same way the
 * Stripe webhook and matching engine already do (see firestore.rules:
 * `profiles/{uid}` has `allow delete: if false` for CLIENT requests only).
 *
 * Order: the subscription is stopped first (see `stopSubscription`), then
 * the profile is taken out of matching, then photos, profile, `users` doc
 * and finally the Firebase Auth user are removed. Every step is safe to
 * repeat, so if a later step fails the member can simply try again and the
 * retry finishes the job. Other members' proposals, invitations and
 * introductions that mention this uid are left as they are: they keep the
 * history, and the member-facing views already show a deleted person as
 * "no longer available".
 */
export async function POST(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  const billingSnap = await adminDb.doc(`billing/${uid}`).get();
  const billing = billingSnap.exists ? (billingSnap.data() as BillingDocument) : null;

  if (billing?.stripeSubscriptionId && isCancelableSubscriptionStatus(billing.status)) {
    const stopped = await stopSubscription(uid, billing.stripeSubscriptionId).catch((error) => {
      console.error(`delete-profile: Stripe unavailable for uid ${uid}`, error);
      return false;
    });
    if (!stopped) {
      return NextResponse.json({ ok: false, error: "subscription_cancel_failed" }, { status: 502 });
    }
  }

  const profileRef = adminDb.doc(`profiles/${uid}`);

  try {
    // Out of the matching pool straight away (`loadEligiblePool` only reads
    // `active_for_matching`; the due scan only reads `active_search`), so
    // even if a later step fails this person is never proposed again.
    const profileSnap = await profileRef.get();
    if (profileSnap.exists) {
      await profileRef.update({
        "meta.profileStatus": "draft",
        "meta.searchStatus": "passive",
        "meta.nextMatchingDueAt": null,
        "meta.updatedAt": new Date(),
      });
    }
  } catch (error) {
    console.error(`delete-profile: failed to take uid ${uid} out of matching`, error);
    return NextResponse.json({ ok: false, error: "deletion_failed" }, { status: 500 });
  }

  // Captured now, before anything is deleted: once the profile/Auth user
  // are gone below, there is no uid left to resolve an email address
  // from. A queueing failure must never abort a deletion the member
  // explicitly requested — hence the swallowed catch.
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
    // aborting a deletion the member explicitly requested.
    console.error(`delete-profile: failed to delete photos for uid ${uid}`, error);
  }

  try {
    // Off every client's preselection, and the team's note on where they live.
    // Not fatal: a deleted profile is already hidden from results and lists.
    await removeCandidateFromShortlists(uid);
    await adminDb.collection(CANDIDATE_LOCATIONS).doc(uid).delete();
  } catch (error) {
    console.error(`delete-profile: failed to remove uid ${uid} from client shortlists`, error);
  }

  try {
    await profileRef.delete();
    await adminDb.doc(`users/${uid}`).delete();

    // billing/{uid} is marked rather than deleted: it's the only durable
    // record of what was charged, and deleting it risks a later, already
    // in-flight Stripe webhook event re-creating a bare doc for this uid via
    // its own `.set(..., { merge: true })`.
    if (billingSnap.exists) {
      await adminDb.doc(`billing/${uid}`).set({ profileDeleted: true, deletedAt: new Date() }, { merge: true });
    }

    await adminAuth.deleteUser(uid).catch((error: { code?: string }) => {
      // Already gone (a retry after a partial failure): nothing to do.
      if (error?.code !== "auth/user-not-found") throw error;
    });
  } catch (error) {
    console.error(`delete-profile: failed to delete account data for uid ${uid}`, error);
    return NextResponse.json({ ok: false, error: "deletion_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
