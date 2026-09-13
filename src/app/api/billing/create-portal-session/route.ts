import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getStripe } from "@/lib/stripe/client";
import type { BillingDocument } from "@/lib/billing/types";

export const runtime = "nodejs";

/**
 * Opens the Stripe Customer Portal for cancellation/plan management — the
 * preferred, Stripe-hosted path per spec, rather than a bespoke
 * cancellation UI. The Stripe Customer ID is always looked up server-side
 * from this uid's own `billing/{uid}` document; a client can never supply
 * (and therefore never spoof) which Stripe Customer to open a portal
 * session for.
 */
export async function POST(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  const billingSnap = await adminDb.doc(`billing/${uid}`).get();
  const billing = billingSnap.exists ? (billingSnap.data() as BillingDocument) : null;

  if (!billing?.stripeCustomerId) {
    return NextResponse.json({ ok: false, error: "no_billing_account" }, { status: 404 });
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json({ ok: false, error: "billing_not_configured" }, { status: 503 });
  }

  const origin = new URL(request.url).origin;
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    return_url: `${origin}/member/plan`,
  });

  return NextResponse.json({ ok: true, url: portalSession.url });
}
