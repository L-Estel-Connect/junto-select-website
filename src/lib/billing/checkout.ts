import "server-only";
import { MEMBERSHIP_SALES_OPEN } from "@/lib/billing/membershipSales";
import { adminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe/client";
import { getStripePriceId } from "@/lib/stripe/plans";
import { getAppBaseUrl } from "@/lib/config/appBaseUrl";
import type { PlanKey } from "@/lib/billing/plans";
import type { BillingDocument } from "@/lib/billing/types";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/versions";

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string; status: number };

/**
 * The Stripe part of starting a paid membership, shared by
 * `/api/billing/create-checkout-session` (existing member-area path) and
 * `/api/membership/start` (membership-first path from /membresia). Moved
 * here unchanged from the original route; the only new input is where
 * Stripe sends the browser back to (`successPath`/`cancelPath`, app-relative
 * paths chosen by the calling route, never by the client). Callers must
 * have already authenticated the user and checked terms + market
 * eligibility.
 */
export async function createMembershipCheckout(params: {
  uid: string;
  email: string | null | undefined;
  planKey: PlanKey;
  successPath: string;
  cancelPath: string;
}): Promise<CheckoutResult> {
  const { uid, email, planKey, successPath, cancelPath } = params;

  // Last line of defence: no new Membresía subscription while sales are closed.
  if (!MEMBERSHIP_SALES_OPEN) {
    return { ok: false, error: "membership_sales_closed", status: 403 };
  }

  let priceId: string;
  try {
    priceId = getStripePriceId(planKey);
  } catch {
    return { ok: false, error: "billing_not_configured", status: 503 };
  }

  const billingRef = adminDb.doc(`billing/${uid}`);
  const billingSnap = await billingRef.get();
  const billing = billingSnap.exists ? (billingSnap.data() as BillingDocument) : null;

  // Someone with a currently-valid subscription should manage it via the
  // Customer Portal (plan changes, cancellation), never by starting a
  // second, competing subscription from this endpoint.
  if (billing && (billing.status === "active" || billing.status === "trialing" || billing.status === "past_due")) {
    return { ok: false, error: "already_active", status: 409 };
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return { ok: false, error: "billing_not_configured", status: 503 };
  }

  let appBaseUrl: string;
  try {
    appBaseUrl = getAppBaseUrl();
  } catch (error) {
    console.error("create-checkout-session: APP_BASE_URL misconfigured", error);
    return { ok: false, error: "app_url_not_configured", status: 503 };
  }

  // Reuse the existing Stripe Customer for this uid if one was already
  // created by a prior checkout attempt; otherwise create one now, tagged
  // with the Firebase uid so the webhook can always resolve events back to
  // the right member without ever trusting client-supplied identity.
  let customerId = billing?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: email ?? undefined,
      metadata: { firebaseUid: uid },
    });
    customerId = customer.id;
  }

  const now = new Date();
  await billingRef.set(
    {
      stripeCustomerId: customerId,
      termsAcceptance: {
        version: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
        planKey,
        acceptedAt: now,
        immediateServiceRequested: true,
      },
      updatedAt: now,
      createdAt: billing?.createdAt ?? now,
      status: billing?.status ?? "none",
      stripeSubscriptionId: billing?.stripeSubscriptionId ?? null,
      planKey: billing?.planKey ?? null,
      currentPeriodEnd: billing?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: billing?.cancelAtPeriodEnd ?? false,
      canceledAt: billing?.canceledAt ?? null,
      lastPaymentFailedAt: billing?.lastPaymentFailedAt ?? null,
    } satisfies BillingDocument,
    { merge: true },
  );

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appBaseUrl}${successPath}`,
    cancel_url: `${appBaseUrl}${cancelPath}`,
    client_reference_id: uid,
    subscription_data: {
      metadata: { firebaseUid: uid, planKey },
    },
    metadata: { firebaseUid: uid, planKey },
  });

  if (!session.url) {
    return { ok: false, error: "checkout_session_failed", status: 502 };
  }

  return { ok: true, url: session.url };
}
