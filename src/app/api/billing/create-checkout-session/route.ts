import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { isPlanKey, type PlanKey } from "@/lib/billing/plans";
import { createMembershipCheckout } from "@/lib/billing/checkout";
import { withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";
import { isMarketAvailabilityEligible } from "@/lib/introduction/completion";

export const runtime = "nodejs";

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

  let body: { planKey?: unknown; termsAccepted?: unknown; immediateServiceRequested?: unknown; returnTo?: unknown };
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

  // A second, separate affirmative request — distinct from ordinary Terms
  // acceptance — that the paid search service begin immediately, before
  // Spain's statutory 14-day withdrawal period (RDL 1/2007) ends. Required
  // because search/matching genuinely starts as soon as payment succeeds;
  // without this express request on record, starting the service early
  // wouldn't be properly documented as the consumer's own informed choice.
  if (body.immediateServiceRequested !== true) {
    return NextResponse.json({ ok: false, error: "immediate_service_not_requested" }, { status: 400 });
  }

  // Madrid service eligibility, checked BEFORE Stripe is ever involved —
  // see eligibility.ts isMarketAvailabilityEligible for the shared
  // business rule (the three "in Madrid in some form" answers are fully
  // equivalent; only an explicit "not regularly in Madrid" blocks this).
  // Never accept payment from someone who has explicitly told us they
  // aren't regularly available in Madrid and only tell them afterward
  // that they can't receive selections.
  const profileSnap = await adminDb.doc(`profiles/${uid}`).get();
  const profile = withProfileDefaults(uid, (profileSnap.exists ? profileSnap.data() : {}) as Partial<ProfileDocument>);
  if (!isMarketAvailabilityEligible(profile)) {
    return NextResponse.json({ ok: false, error: "market_not_available" }, { status: 400 });
  }

  const result = await createMembershipCheckout({
    uid,
    email,
    planKey,
    // "Búsqueda activa" pays on the last step of the profile and returns
    // there; every other caller returns to Mi plan, as before.
    successPath: body.returnTo === "profile" ? "/member/profile?checkout=success" : "/member/plan?checkout=success",
    cancelPath: body.returnTo === "profile" ? "/member/profile?checkout=cancel" : "/member/plan?checkout=cancel",
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, url: result.url });
}
