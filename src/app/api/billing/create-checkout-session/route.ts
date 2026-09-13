import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getStripe } from "@/lib/stripe/client";
import { getStripePriceId } from "@/lib/stripe/plans";
import { isPlanKey, type PlanKey } from "@/lib/billing/plans";
import type { BillingDocument } from "@/lib/billing/types";

export const runtime = "nodejs";

/** Bumped only if the terms/disclosures copy shown before checkout changes materially. */
const CURRENT_TERMS_VERSION = "2026-09-membership-v1";

/**
 * Starts a paid-membership subscription. Two things make price injection
 * structurally impossible here, not just policy: the request body carries
 * only an opaque `planKey` ("monthly" | "three_month" | "six_month"), never
 * a Price ID or amount — `getStripePriceId` (server-only) is the sole
 * mapping from key to real Stripe Price; and the actual charge is created
 * by Stripe from that Price server-side, so nothing the client sends can
 * change what gets billed.
 *
 * `success_url`/`cancel_url` are used only to route the browser back to
 * `/member/plan` with a hint for immediate UI copy ("we're confirming your
 * payment…") — they are NEVER read as proof of payment. The only source of
 * truth for entitlement is the webhook-driven `billing/{uid}` document; see
 * `/api/billing/webhook`.
 */
export async function POST(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  const { uid, email } = auth;

  let body: { planKey?: unknown; termsAccepted?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  if (!isPlanKey(body.planKey)) {
    return NextResponse.json({ ok: false, error: "invalid_plan" }, { status: 400 });
  }
  const planKey: PlanKey = body.planKey;

  if (body.termsAccepted !== true) {
    return NextResponse.json({ ok: false, error: "terms_not_accepted" }, { status: 400 });
  }

  let priceId: string;
  try {
    priceId = getStripePriceId(planKey);
  } catch {
    return NextResponse.json({ ok: false, error: "billing_not_configured" }, { status: 503 });
  }

  const billingRef = adminDb.doc(`billing/${uid}`);
  const billingSnap = await billingRef.get();
  const billing = billingSnap.exists ? (billingSnap.data() as BillingDocument) : null;

  // Someone with a currently-valid subscription should manage it via the
  // Customer Portal (plan changes, cancellation), never by starting a
  // second, competing subscription from this endpoint.
  if (billing && (billing.status === "active" || billing.status === "trialing" || billing.status === "past_due")) {
    return NextResponse.json({ ok: false, error: "already_active" }, { status: 409 });
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json({ ok: false, error: "billing_not_configured" }, { status: 503 });
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
      termsAcceptance: { version: CURRENT_TERMS_VERSION, planKey, acceptedAt: now },
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

  const origin = new URL(request.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/member/plan?checkout=success`,
    cancel_url: `${origin}/member/plan?checkout=cancel`,
    client_reference_id: uid,
    subscription_data: {
      metadata: { firebaseUid: uid, planKey },
    },
    metadata: { firebaseUid: uid, planKey },
  });

  if (!session.url) {
    return NextResponse.json({ ok: false, error: "checkout_session_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, url: session.url });
}
