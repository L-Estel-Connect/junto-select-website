import { NextResponse } from "next/server";
import { MEMBERSHIP_SALES_OPEN } from "@/lib/billing/membershipSales";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { isPlanKey } from "@/lib/billing/plans";
import { createMembershipCheckout } from "@/lib/billing/checkout";
import {
  withProfileDefaults,
  type MarketAvailability,
  type ProfileDocument,
} from "@/lib/introduction/types";
import { isMarketAvailabilityEligible } from "@/lib/introduction/completion";

export const runtime = "nodejs";

const MARKET_ANSWERS: MarketAvailability[] = [
  "lives_in_market",
  "lives_near_market",
  "frequent_visitor",
  "not_regular_in_market",
];

/**
 * Membership-first path: /membresia → choose plan → account → this route →
 * Stripe Checkout → /member/bienvenida → introductions profile afterwards.
 *
 * Differences from `/api/billing/create-checkout-session` (the existing
 * member-area path, unchanged):
 * 1. The visitor may not have a profile yet. The payment webhook only
 *    UPDATES `profiles/{uid}` (searchStatus, matching anchor) and silently
 *    loses that write if the document doesn't exist — so a minimal, empty
 *    draft profile is created here, server-side, BEFORE Stripe is involved.
 *    It is identical to what onboarding's getOrCreateProfile would create,
 *    plus the one Madrid-availability answer checkout requires. An existing
 *    profile is never overwritten; only an unanswered
 *    `visible.marketAvailability` is filled in.
 * 2. Age (35+) is confirmed here because the draft profile has no birth
 *    date yet; the confirmation is recorded in `membershipSignups/{uid}`
 *    (server-only collection), not on the profile.
 * 3. Stripe returns to /member/bienvenida instead of /member/plan, which
 *    requires a finalized profile.
 * Terms acceptance, the immediate-service request, market eligibility,
 * plan allowlisting and the "already active" guard are the same rules as
 * the existing route (the last two live in createMembershipCheckout).
 */
export async function POST(request: Request) {
  // Membresía is closed to new subscriptions; checked before anything is written.
  if (!MEMBERSHIP_SALES_OPEN) {
    return NextResponse.json({ ok: false, error: "membership_sales_closed" }, { status: 403 });
  }
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  const { uid, email } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  if (!isPlanKey(body.planKey)) {
    return NextResponse.json({ ok: false, error: "invalid_plan" }, { status: 400 });
  }
  const planKey = body.planKey;
  if (body.ageConfirmed !== true) {
    return NextResponse.json({ ok: false, error: "age_not_confirmed" }, { status: 400 });
  }
  if (body.termsAccepted !== true) {
    return NextResponse.json({ ok: false, error: "terms_not_accepted" }, { status: 400 });
  }
  if (body.immediateServiceRequested !== true) {
    return NextResponse.json({ ok: false, error: "immediate_service_not_requested" }, { status: 400 });
  }
  const answer = MARKET_ANSWERS.find((v) => v === body.marketAvailability) ?? null;
  // Never create a profile for, or take payment from, someone who just told
  // us they aren't regularly in Madrid (same rule as the existing route).
  if (answer === "not_regular_in_market") {
    return NextResponse.json({ ok: false, error: "market_not_available" }, { status: 400 });
  }

  const profileRef = adminDb.doc(`profiles/${uid}`);
  const profile = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(profileRef);
    if (!snap.exists) {
      if (!answer) return null;
      const initial = withProfileDefaults(uid, { visible: { marketAvailability: answer } as ProfileDocument["visible"] });
      tx.create(profileRef, {
        ...initial,
        meta: { ...initial.meta, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      });
      return initial;
    }
    const existing = withProfileDefaults(uid, snap.data() as Partial<ProfileDocument>);
    if (existing.visible.marketAvailability === null && answer) {
      tx.update(profileRef, { "visible.marketAvailability": answer, "meta.updatedAt": FieldValue.serverTimestamp() });
      return { ...existing, visible: { ...existing.visible, marketAvailability: answer } };
    }
    return existing;
  });

  if (!profile) {
    return NextResponse.json({ ok: false, error: "market_answer_required" }, { status: 400 });
  }
  if (!isMarketAvailabilityEligible(profile)) {
    return NextResponse.json({ ok: false, error: "market_not_available" }, { status: 400 });
  }

  await adminDb.doc(`membershipSignups/${uid}`).set(
    {
      uid,
      source: "membresia",
      planKey,
      ageConfirmedAt: FieldValue.serverTimestamp(),
      lastCheckoutStartedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const result = await createMembershipCheckout({
    uid,
    email,
    planKey,
    successPath: "/member/bienvenida?checkout=success",
    cancelPath: `/membresia/alta?plan=${planKey}&checkout=cancel`,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, url: result.url });
}
