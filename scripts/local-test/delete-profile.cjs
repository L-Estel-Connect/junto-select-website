/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// "Eliminar mi perfil" against the local build (emulators + mock Stripe):
//   set -a; . ./.env.local; set +a
//   NODE_PATH=$(npm root -g) node scripts/local-test/delete-profile.cjs
// Cases: a test account that "paid" before the switch to live Stripe (its
// subscription id is unknown to the current key), a live active
// subscription, an already-canceled one, no billing at all, Stripe failing
// (nothing may be deleted), a retry after a half-finished deletion, and the
// whole thing through the real screens ending on the confirmation page.
// Another member's profile, proposals, invitations and introductions with
// the deleted person must stay exactly as they were.
const fs = require("node:fs");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const project = process.env.GCLOUD_PROJECT || "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !project.startsWith("demo-")) {
  console.error("Refusing to run outside the emulators.");
  process.exit(1);
}
initializeApp({ projectId: project });
const auth = getAuth();
const db = getFirestore();

const APP = "http://localhost:3000";
const MOCK = "http://127.0.0.1:12111";
const AUTH_EMU = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
const MOCK_LOG = ".local-test/mock-log.jsonl";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const mockLog = () =>
  fs.existsSync(MOCK_LOG) ? fs.readFileSync(MOCK_LOG, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];

const ts = (iso) => Timestamp.fromDate(new Date(iso));
function profileFor(uid, firstName, gender, metaOver = {}) {
  return {
    visible: {
      firstName, gender, city: "Madrid", profession: "Prueba", educationLevel: "universidad", heightCm: 178,
      languages: ["es"], hasChildren: false, hasYoungChildren: false, childrenCount: null, childrenBirthYears: null,
      wantsFutureChildren: "no", relationshipIntention: "relacion_estable", smoking: "no", drinking: "socialmente",
      activityLevel: "activo", market: "madrid", marketAvailability: "lives_in_market",
    },
    private: { birthDate: ts("1972-03-10T00:00:00Z"), incomeRange: null },
    photos: [`profiles/${uid}/a.jpg`],
    meta: {
      onboardingStepIndex: 9, aboutMeComplete: true, photosComplete: true, preferencesComplete: true,
      presentationComplete: true, profileStatus: "active_for_matching", onboardingFinalized: true,
      searchStatus: "passive", duplicateStatus: "clear", duplicateOf: null, pendingLegacyActivation: false,
      legacyImportId: null, matchingAnchorAt: null, matchingSubscriptionId: null, matchingPeriodsProcessed: 0,
      nextMatchingDueAt: null, personId: uid, createdAt: ts("2026-09-15T10:00:00Z"), updatedAt: ts("2026-09-15T10:00:00Z"),
      ...metaOver,
    },
  };
}

async function seedAccount(uid, { billing, profile = true } = {}) {
  await auth.deleteUser(uid).catch(() => {});
  await auth.createUser({ uid, email: `${uid}@example.test`, emailVerified: true });
  await db.doc(`users/${uid}`).set({ email: `${uid}@example.test`, displayName: null, role: "member", createdAt: ts("2026-09-15T10:00:00Z") });
  if (profile) {
    await db.doc(`profiles/${uid}`).set(
      profileFor(uid, "Antonio", "hombre", billing?.status === "active"
        ? { searchStatus: "active_search", matchingAnchorAt: ts("2026-09-20T10:00:00Z"), nextMatchingDueAt: ts("2026-10-20T10:00:00Z") }
        : {}),
    );
  } else {
    await db.doc(`profiles/${uid}`).delete();
  }
  if (billing) {
    await db.doc(`billing/${uid}`).set({
      stripeCustomerId: "cus_seed", stripeSubscriptionId: null, status: "none", planKey: "monthly",
      currentPeriodEnd: ts("2026-10-20T10:00:00Z"), cancelAtPeriodEnd: false, canceledAt: null,
      lastPaymentFailedAt: null, termsAcceptance: null, createdAt: ts("2026-09-20T10:00:00Z"),
      updatedAt: ts("2026-09-20T10:00:00Z"), ...billing,
    });
  } else {
    await db.doc(`billing/${uid}`).delete();
  }
}

async function tokenFor(uid) {
  const custom = await auth.createCustomToken(uid);
  const res = await fetch(`${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  return (await res.json()).idToken;
}

async function deleteViaApi(uid) {
  const res = await fetch(`${APP}/api/member/delete-profile`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await tokenFor(uid)}` },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function state(uid) {
  const [profile, user, billing] = await Promise.all([
    db.doc(`profiles/${uid}`).get(),
    db.doc(`users/${uid}`).get(),
    db.doc(`billing/${uid}`).get(),
  ]);
  const authExists = await auth.getUser(uid).then(() => true, () => false);
  return { profile: profile.exists ? profile.data() : null, user: user.exists, billing: billing.exists ? billing.data() : null, authExists };
}

function fullyDeleted(s) {
  return !s.profile && !s.user && !s.authExists;
}

// Another member, with history involving the account being deleted.
const OTHER = "del-other-member";
async function seedOtherMemberWith(uid) {
  await auth.deleteUser(OTHER).catch(() => {});
  await auth.createUser({ uid: OTHER, email: `${OTHER}@example.test`, emailVerified: true });
  await db.doc(`profiles/${OTHER}`).set(profileFor(OTHER, "Marta", "mujer", { searchStatus: "active_search" }));
  const base = { cycleId: "c-del", createdAt: ts("2026-10-01T10:00:00Z"), updatedAt: ts("2026-10-01T10:00:00Z") };
  await db.doc(`proposals/p-del-1`).set({ ...base, recipientPersonId: OTHER, candidatePersonId: uid, recipientUid: OTHER, candidateUid: uid, score: 80, stage: "proposed", passType: null, viewedAt: null, decidedAt: null });
  await db.doc(`invitations/p-del-2`).set({ ...base, proposalId: "p-del-2", recipientPersonId: OTHER, recipientUid: OTHER, inviterPersonId: uid, inviterUid: uid, stage: "invited", passType: null, viewedAt: null, decidedAt: null });
  await db.doc(`introductions/p-del-3`).set({ proposalId: "p-del-3", cycleId: "c-del", personIdA: OTHER, personIdB: uid, uidA: OTHER, uidB: uid, createdAt: ts("2026-10-02T10:00:00Z"), contactRevealedAt: null });
  return snapshotOther();
}
async function snapshotOther() {
  const docs = await Promise.all(
    [`profiles/${OTHER}`, "proposals/p-del-1", "invitations/p-del-2", "introductions/p-del-3"].map((p) => db.doc(p).get()),
  );
  return JSON.stringify(docs.map((d) => d.data() ?? null));
}

async function poolContains(uid) {
  const snap = await db.collection("profiles").where("meta.profileStatus", "==", "active_for_matching").get();
  return snap.docs.some((d) => d.id === uid);
}

async function apiCases() {
  // 1. Test account that "paid" before live Stripe: billing says active,
  //    but the subscription id doesn't exist for the current key.
  {
    const uid = "del-prelive-test";
    await seedAccount(uid, { billing: { status: "active", stripeSubscriptionId: "sub_1PreLiveTestMode0001" } });
    const before = await seedOtherMemberWith(uid);
    check("pre-live test account starts in the matching pool", await poolContains(uid));
    const logBefore = mockLog().length;
    const r = await deleteViaApi(uid);
    const s = await state(uid);
    check("pre-live test account: deletion succeeds", r.status === 200 && r.body?.ok, `HTTP ${r.status} ${JSON.stringify(r.body)}`);
    check("pre-live test account: profile, users doc and login removed", fullyDeleted(s), JSON.stringify({ ...s, billing: undefined }));
    check("pre-live test account: billing kept and marked deleted", s.billing?.profileDeleted === true);
    check("pre-live test account: out of the matching pool", !(await poolContains(uid)));
    check("pre-live test account: no cancel sent to Stripe", !mockLog().slice(logBefore).some((e) => e.kind === "subscription_cancel"));
    check("other member's profile, proposal, invitation and introduction unchanged", (await snapshotOther()) === before);
  }

  // 2. Live, active subscription: canceled at Stripe before deleting.
  {
    const uid = "del-live-active";
    const sub = await (await fetch(`${MOCK}/test/subscriptions`, {
      method: "POST", body: JSON.stringify({ customer: "cus_live_1", metadata: { firebaseUid: uid } }),
    })).json();
    await seedAccount(uid, { billing: { status: "active", stripeSubscriptionId: sub.id, stripeCustomerId: "cus_live_1" } });
    const r = await deleteViaApi(uid);
    const s = await state(uid);
    const stripeSub = await (await fetch(`${MOCK}/v1/subscriptions/${sub.id}`)).json();
    check("live subscription: deletion succeeds", r.status === 200 && r.body?.ok, `HTTP ${r.status} ${JSON.stringify(r.body)}`);
    check("live subscription: canceled at Stripe", stripeSub.status === "canceled");
    check("live subscription: account removed", fullyDeleted(s));
  }

  // 3. Billing still says active, but Stripe already canceled it.
  {
    const uid = "del-already-canceled";
    const sub = await (await fetch(`${MOCK}/test/subscriptions`, {
      method: "POST", body: JSON.stringify({ customer: "cus_live_2" }),
    })).json();
    await fetch(`${MOCK}/test/subscriptions/${sub.id}/cancel`, { method: "POST" });
    await seedAccount(uid, { billing: { status: "active", stripeSubscriptionId: sub.id, stripeCustomerId: "cus_live_2" } });
    const logBefore = mockLog().length;
    const r = await deleteViaApi(uid);
    check("already-canceled subscription: deletion succeeds", r.status === 200 && r.body?.ok, `HTTP ${r.status}`);
    check("already-canceled subscription: no second cancel", !mockLog().slice(logBefore).some((e) => e.kind === "subscription_cancel"));
    check("already-canceled subscription: account removed", fullyDeleted(await state(uid)));
  }

  // 4. Never paid.
  {
    const uid = "del-no-billing";
    await seedAccount(uid, {});
    const r = await deleteViaApi(uid);
    check("no membership: deletion succeeds", r.status === 200 && r.body?.ok, `HTTP ${r.status}`);
    check("no membership: account removed", fullyDeleted(await state(uid)));
  }

  // 5. Stripe failing for a live subscription: nothing may be deleted.
  {
    const uid = "del-stripe-down";
    await seedAccount(uid, { billing: { status: "active", stripeSubscriptionId: "sub_fail_live_0001" } });
    const r = await deleteViaApi(uid);
    const s = await state(uid);
    check("Stripe failing: deletion refused", r.status === 502 && r.body?.error === "subscription_cancel_failed", `HTTP ${r.status}`);
    check("Stripe failing: profile, login and matching state untouched",
      !!s.profile && s.user && s.authExists && s.profile.meta.profileStatus === "active_for_matching" && s.profile.meta.searchStatus === "active_search");
  }

  // 6. Retry after a half-finished deletion (profile already gone, login still there).
  {
    const uid = "del-half-done";
    await seedAccount(uid, { profile: false, billing: { status: "canceled", stripeSubscriptionId: "sub_old", profileDeleted: true } });
    await db.doc(`users/${uid}`).delete();
    const r = await deleteViaApi(uid);
    check("retry after partial deletion: succeeds", r.status === 200 && r.body?.ok, `HTTP ${r.status}`);
    check("retry after partial deletion: login removed", !(await state(uid)).authExists);
  }
}

async function magicLinkTarget(email) {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${AUTH_EMU}/emulator/v1/projects/${project}/oobCodes`);
    const { oobCodes } = await res.json();
    const hit = oobCodes.filter((c) => c.email === email && c.requestType === "EMAIL_SIGNIN").pop();
    if (hit) {
      const u = new URL(hit.oobLink);
      const target = new URL(u.searchParams.get("continueUrl"));
      for (const [k, v] of u.searchParams) if (k !== "continueUrl") target.searchParams.set(k, v);
      return target.toString();
    }
    await sleep(500);
  }
  throw new Error(`no magic link for ${email}`);
}

async function uiCase() {
  // The same pre-live test account, deleted by its owner through Ajustes.
  const { chromium } = require("playwright");
  const uid = "del-ui-antonio";
  const email = `${uid}@example.test`;
  await seedAccount(uid, { billing: { status: "active", stripeSubscriptionId: "sub_1PreLiveTestModeUI01" } });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`${APP}/introduction`);
    await page.click("text=Continuar con email");
    await page.fill("input[type=email]", email);
    await page.click("text=Enviar enlace");
    await page.waitForTimeout(800);
    await page.goto(await magicLinkTarget(email));
    await page.waitForTimeout(2500);
    await page.goto(`${APP}/member/settings`);
    await page.click("text=Eliminar perfil", { timeout: 20000 });
    await page.check("input[type=checkbox]");
    await page.click("button:has-text('Eliminar mi perfil')");
    await page.waitForURL("**/perfil-eliminado", { timeout: 20000 });
    const heading = await page.locator("h2").first().innerText();
    fs.mkdirSync(".local-test/shots", { recursive: true });
    await page.screenshot({ path: ".local-test/shots/perfil-eliminado.png", fullPage: true });
    check("UI: confirmation page shown after deleting", /Tu perfil se ha eliminado/.test(heading), heading);
    check("UI: account removed", fullyDeleted(await state(uid)));
    await page.goto(`${APP}/member/settings`);
    await page.waitForTimeout(3000);
    check("UI: member area no longer open afterwards", !page.url().includes("/member/settings"), page.url());
  } finally {
    await browser.close();
  }
}

(async () => {
  await apiCases();
  await uiCase();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
