/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// "Eliminar mi perfil" on STAGING (junto-select-staging only; refuses any
// other project). Creates its own throwaway accounts named del-staging-*,
// deletes them through the deployed /api/member/delete-profile and checks
// the result. Needs Application Default Credentials that can write to the
// staging project (e.g. impersonating claude-staging-deploy).
//
//   STAGING_URL=https://junto-select-website--junto-select-staging.europe-west4.hosted.app \
//   [STRIPE_TEST_SECRET_KEY=sk_test_...] node scripts/local-test/delete-profile-staging.cjs
//
// With STRIPE_TEST_SECRET_KEY (the staging test key) it also checks that a
// real Stripe TEST subscription is canceled before the account goes.
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const PROJECT = "junto-select-staging";
const API_KEY = "AIzaSyCwVbQN0hPJJy70A1WYugVcX8xrI8wbO8k"; // public web key, apphosting.staging.yaml
const PRICE_MONTHLY = "price_1UPoBNGlmEAMyuMwsX5Z5yQx"; // staging test price, apphosting.staging.yaml
const APP = process.env.STAGING_URL || "https://junto-select-website--junto-select-staging.europe-west4.hosted.app";
if (!APP.includes("junto-select-staging")) {
  console.error("Refusing: STAGING_URL must be the junto-select-staging site.");
  process.exit(1);
}

initializeApp({ projectId: PROJECT });
const auth = getAuth();
const db = getFirestore();

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const ts = (iso) => Timestamp.fromDate(new Date(iso));

function profile(uid, active) {
  return {
    visible: {
      firstName: "PruebaBorrado", gender: "hombre", city: "Madrid", profession: "Prueba", educationLevel: "universidad",
      heightCm: 178, languages: ["es"], hasChildren: false, hasYoungChildren: false, childrenCount: null,
      childrenBirthYears: null, wantsFutureChildren: "no", relationshipIntention: "relacion_estable", smoking: "no",
      drinking: "socialmente", activityLevel: "activo", market: "madrid", marketAvailability: "lives_in_market",
    },
    private: { birthDate: ts("1972-03-10T00:00:00Z"), incomeRange: null },
    photos: [],
    meta: {
      onboardingStepIndex: 9, aboutMeComplete: true, photosComplete: true, preferencesComplete: true,
      presentationComplete: true, profileStatus: "active_for_matching", onboardingFinalized: true,
      searchStatus: active ? "active_search" : "passive", duplicateStatus: "clear", duplicateOf: null,
      pendingLegacyActivation: false, legacyImportId: null, matchingAnchorAt: null, matchingSubscriptionId: null,
      matchingPeriodsProcessed: 0, nextMatchingDueAt: null, personId: uid,
      createdAt: ts("2026-09-15T10:00:00Z"), updatedAt: ts("2026-09-15T10:00:00Z"),
    },
  };
}

async function seed(uid, billing) {
  await auth.deleteUser(uid).catch(() => {});
  await auth.createUser({ uid, email: `${uid}@junto-select-staging.test`, emailVerified: true });
  await db.doc(`users/${uid}`).set({ email: `${uid}@junto-select-staging.test`, displayName: null, role: "member", createdAt: ts("2026-09-15T10:00:00Z") });
  await db.doc(`profiles/${uid}`).set(profile(uid, billing?.status === "active"));
  if (billing) {
    await db.doc(`billing/${uid}`).set({
      stripeCustomerId: null, stripeSubscriptionId: null, status: "none", planKey: "monthly", currentPeriodEnd: null,
      cancelAtPeriodEnd: false, canceledAt: null, lastPaymentFailedAt: null, termsAcceptance: null,
      createdAt: ts("2026-09-20T10:00:00Z"), updatedAt: ts("2026-09-20T10:00:00Z"), ...billing,
    });
  }
}

async function del(uid) {
  const custom = await auth.createCustomToken(uid);
  const t = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const { idToken } = await t.json();
  const res = await fetch(`${APP}/api/member/delete-profile`, { method: "POST", headers: { Authorization: `Bearer ${idToken}` } });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function gone(uid) {
  const [p, u] = await Promise.all([db.doc(`profiles/${uid}`).get(), db.doc(`users/${uid}`).get()]);
  const a = await auth.getUser(uid).then(() => true, () => false);
  const b = await db.doc(`billing/${uid}`).get();
  return { profile: p.exists, user: u.exists, auth: a, billingMarked: b.exists ? b.data().profileDeleted === true : null };
}

(async () => {
  // 1. Account that "paid" before the switch to live: billing says active,
  //    the subscription id does not exist for the current Stripe key.
  {
    const uid = "del-staging-prelive";
    await seed(uid, { status: "active", stripeSubscriptionId: "sub_1PreLiveTestModeStg01", stripeCustomerId: "cus_PreLiveStg01" });
    const r = await del(uid);
    const g = await gone(uid);
    check("pre-live test account: deletion succeeds", r.status === 200 && r.body?.ok, `HTTP ${r.status} ${JSON.stringify(r.body)}`);
    check("pre-live test account: profile, users doc and login removed", !g.profile && !g.user && !g.auth, JSON.stringify(g));
    check("pre-live test account: billing kept and marked deleted", g.billingMarked === true);
  }

  // 2. No membership.
  {
    const uid = "del-staging-nobilling";
    await seed(uid, null);
    const r = await del(uid);
    const g = await gone(uid);
    check("no membership: deletion succeeds", r.status === 200 && r.body?.ok, `HTTP ${r.status}`);
    check("no membership: account removed", !g.profile && !g.user && !g.auth, JSON.stringify(g));
  }

  // 3. A real Stripe TEST subscription, canceled before deleting.
  const key = process.env.STRIPE_TEST_SECRET_KEY || "";
  if (key.startsWith("sk_test_")) {
    const Stripe = require("stripe");
    const stripe = new Stripe(key);
    const uid = "del-staging-stripe";
    const customer = await stripe.customers.create({
      email: `${uid}@junto-select-staging.test`, payment_method: "pm_card_visa",
      invoice_settings: { default_payment_method: "pm_card_visa" }, metadata: { firebaseUid: uid },
    });
    const sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: PRICE_MONTHLY }], metadata: { firebaseUid: uid } });
    await seed(uid, { status: "active", stripeSubscriptionId: sub.id, stripeCustomerId: customer.id });
    const r = await del(uid);
    const after = await stripe.subscriptions.retrieve(sub.id);
    const g = await gone(uid);
    check("Stripe test subscription: deletion succeeds", r.status === 200 && r.body?.ok, `HTTP ${r.status}`);
    check("Stripe test subscription: canceled at Stripe", after.status === "canceled", after.status);
    check("Stripe test subscription: account removed", !g.profile && !g.user && !g.auth, JSON.stringify(g));
  } else {
    console.log("SKIP  Stripe test subscription case (no STRIPE_TEST_SECRET_KEY)");
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
