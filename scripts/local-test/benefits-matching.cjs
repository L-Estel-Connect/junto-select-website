/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// API-level tests for the two approved fixes, against the local build
// (emulators + mock Stripe/Brevo/Ticket Tailor):
//   A. the 20 % benefit: one code per monthly cycle, for 1-, 3- and
//      6-month plans, through renewals, cancellation and cycle boundaries;
//   B. matching eligibility: profile-first-then-pay and
//      pay-first-then-profile, plus frozen-cycle recovery.
//   set -a; . ./.env.local; set +a
//   node scripts/local-test/benefits-matching.cjs
// Time passing is simulated by moving the mock subscription into the past
// (/test/subscriptions/:id/backdate), never by touching the system clock.
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
const FS_EMU = `http://${process.env.FIRESTORE_EMULATOR_HOST}`;
const ADMIN_SECRET = process.env.MATCHING_ADMIN_SECRET;
const MOCK_LOG = ".local-test/mock-log.jsonl";
const TT_FAIL = ".local-test/tt-fail";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const mockLog = () =>
  fs.existsSync(MOCK_LOG) ? fs.readFileSync(MOCK_LOG, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
const ttCreatesFor = (code) => mockLog().filter((e) => e.service === "tickettailor" && e.kind === "discount_create" && e.data.code === code);

const madridYMD = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const inDays = (n) => madridYMD(new Date(Date.now() + n * 86400000));
const TODAY = inDays(0);

async function tokenFor(uid) {
  await auth.createUser({ uid, email: `${uid}@example.test`, emailVerified: true }).catch((e) => {
    if (e.code !== "auth/uid-already-exists") throw e;
  });
  const custom = await auth.createCustomToken(uid);
  const res = await fetch(`${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  return (await res.json()).idToken;
}

async function api(token, method, path, body) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${APP}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}
const adminScan = async (path) =>
  (await fetch(`${APP}${path}`, { method: "POST", headers: { "x-admin-secret": ADMIN_SECRET } })).json();

async function pay(token, uid, planKey) {
  const start = await api(token, "POST", "/api/membership/start", {
    planKey, ageConfirmed: true, termsAccepted: true, immediateServiceRequested: true, marketAvailability: "lives_in_market",
  });
  if (!start.data?.url) throw new Error(`checkout failed for ${uid}: ${JSON.stringify(start.data)}`);
  const res = await fetch(start.data.url, { method: "POST", redirect: "manual" });
  if (res.status !== 303) throw new Error(`mock pay failed: ${res.status}`);
  return (await db.doc(`billing/${uid}`).get()).data().stripeSubscriptionId;
}
async function control(subId, action, days) {
  const res = await fetch(`${MOCK}/test/subscriptions/${subId}/${action}${days ? `?days=${days}` : ""}`, { method: "POST" });
  const data = await res.json();
  if (data.webhookStatus !== 200) throw new Error(`${action} webhook returned ${data.webhookStatus}`);
}
const claim = (token, ticketTailorEventId) => api(token, "POST", "/api/member/event-benefit", { ticketTailorEventId });
const state = async (token) => (await api(token, "GET", "/api/member/event-benefit")).data;

async function reset(uid) {
  for (const c of ["profiles", "billing", "membershipSignups", "introductionsConsent"]) await db.doc(`${c}/${uid}`).delete();
  for (const c of ["eventBenefits", "eventBenefitCycles"]) {
    const snap = await db.collection(c).where("uid", "==", uid).get();
    for (const d of snap.docs) await d.ref.delete();
  }
  const cycles = await db.collection("matchingCycles").where("config.allowlistPersonIds", "array-contains", uid).get();
  for (const d of cycles.docs) await db.recursiveDelete(d.ref);
}

const EVENTS = {
  "tt-e1": { label: "Cena de prueba 1", eventDate: inDays(3) },
  "tt-e2": { label: "Cena de prueba 2", eventDate: inDays(6) },
  "tt-e7": { label: "Cata de prueba", eventDate: inDays(10) },
  "tt-e3": { label: "Encuentro de prueba (+45 días)", eventDate: inDays(45) },
  "tt-e4": { label: "Encuentro de prueba (+120 días)", eventDate: inDays(120) },
  "tt-e5": { label: "Encuentro pasado", eventDate: inDays(-2) },
  "tt-e6": { label: "Encuentro sin beneficio", eventDate: inDays(5), memberBenefitEnabled: false },
};
async function seedEvents() {
  for (const [id, e] of Object.entries(EVENTS)) {
    await db.doc(`eligibleTicketTailorEvents/${id}`).set({
      ticketTailorEventId: id, ticketTailorTicketTypeIds: [`${id}-general`], label: e.label, eventDate: e.eventDate,
      memberBenefitEnabled: e.memberBenefitEnabled ?? true, reconnectEnabled: false, reconnectForceClosedAt: null,
      ticketTailorCheckoutUrl: `https://www.tickettailor.com/events/test/${id}`, createdAt: new Date(), updatedAt: new Date(),
      lastSyncedAt: null, lastSyncResult: null,
    });
  }
}

// ---------------------------------------------------------------- A. 20 %
async function planJourney(planKey) {
  const uid = `bm-${planKey}`;
  await reset(uid);
  const token = await tokenFor(uid);
  const subId = await pay(token, uid, planKey);
  const tag = `[${planKey}]`;

  let s = await state(token);
  const expected = { monthly: ["tt-e1", "tt-e2", "tt-e7"], three_month: ["tt-e1", "tt-e2", "tt-e7", "tt-e3"], six_month: ["tt-e1", "tt-e2", "tt-e7", "tt-e3", "tt-e4"] }[planKey];
  check(`${tag} payment opens cycle 1 today`, s.cycle && s.cycle.cycleStart === TODAY && !s.cycle.claimed, JSON.stringify(s.cycle));
  check(`${tag} offers only upcoming eligible events inside the paid period`, JSON.stringify(s.claimableEvents.map((e) => e.ticketTailorEventId)) === JSON.stringify(expected), s.claimableEvents.map((e) => e.ticketTailorEventId).join(","));
  check(`${tag} nothing issued automatically`, s.benefits.length === 0);

  check(`${tag} past event refused`, (await claim(token, "tt-e5")).data?.error === "event_not_eligible");
  check(`${tag} event without the benefit refused`, (await claim(token, "tt-e6")).data?.error === "event_not_eligible");
  if (planKey === "monthly") check(`${tag} event after the paid period refused`, (await claim(token, "tt-e3")).data?.error === "event_not_eligible");
  check(`${tag} unknown event refused`, (await claim(token, "tt-nope")).data?.error === "event_not_eligible");

  // Five simultaneous requests for two different events: exactly one code.
  const burst = await Promise.all(["tt-e1", "tt-e1", "tt-e2", "tt-e1", "tt-e2"].map((e) => claim(token, e)));
  const okRes = burst.filter((r) => r.status === 200);
  const codes = new Set(okRes.map((r) => r.data.benefit.code));
  const lockSnap = await db.collection("eventBenefitCycles").where("uid", "==", uid).get();
  const benefitSnap = await db.collection("eventBenefits").where("uid", "==", uid).get();
  check(`${tag} concurrent claims create exactly one code and one cycle lock`, codes.size === 1 && lockSnap.size === 1 && benefitSnap.size === 1, `codes=${codes.size} locks=${lockSnap.size} docs=${benefitSnap.size}`);
  check(`${tag} the losing requests are told the cycle is used`, burst.filter((r) => r.status !== 200).every((r) => r.data.error === "cycle_already_claimed"));
  const first = benefitSnap.docs[0].data();
  const firstEvent = first.ticketTailorEventId;
  const tt = ttCreatesFor(first.code);
  check(`${tag} Ticket Tailor discount: 20 %, single use, that event's tickets, expires on the event day`, tt.length === 1 && tt[0].data.face_value_percentage === 20 && tt[0].data.max_redemptions === 1 && tt[0].data.ticket_types.join() === `${firstEvent}-general` && madridYMD(new Date(Number(tt[0].data.expires) * 1000)) === EVENTS[firstEvent].eventDate, JSON.stringify(tt[0]?.data));
  check(`${tag} code is active and shown`, first.status === "active" && okRes[0].data.benefit.ready === true);
  const again = await claim(token, firstEvent);
  check(`${tag} repeating the same request returns the same code`, again.status === 200 && again.data.benefit.code === first.code && ttCreatesFor(first.code).length === 1);
  s = await state(token);
  check(`${tag} cycle shows as used, nothing left to claim`, s.cycle.claimed && s.claimableEvents.length === 0 && s.benefits.length === 1);

  // ---- Next monthly cycle ----
  const otherEvent = firstEvent === "tt-e1" ? "tt-e2" : "tt-e1";
  await control(subId, "backdate", 31);
  if (planKey === "monthly") {
    s = await state(token);
    check(`${tag} after one month, no new code until the renewal is paid`, s.cycle === null && (await claim(token, otherEvent)).data?.error === "no_active_cycle");
    await control(subId, "renew");
  }
  s = await state(token);
  check(`${tag} cycle 2 opens a new code`, s.cycle && !s.cycle.claimed && s.cycle.cycleStart !== TODAY, JSON.stringify(s.cycle));
  check(`${tag} cycle 2 won't issue a second code for the same event`, (await claim(token, firstEvent)).data?.error === "event_already_has_code");
  const c2 = await claim(token, otherEvent);
  check(`${tag} cycle 2 code issued for another event`, c2.status === 200 && c2.data.benefit.ready && c2.data.benefit.code !== first.code);
  check(`${tag} cycle 2 second claim refused`, (await claim(token, "tt-e7")).data?.error === "cycle_already_claimed");
  s = await state(token);
  check(`${tag} cycle 1 code is still held and valid`, s.benefits.some((b) => b.code === first.code && b.ready));

  // ---- Across the end of the paid period ----
  const months = { monthly: 1, three_month: 3, six_month: 6 }[planKey];
  const toEnd = { monthly: 31, three_month: 61, six_month: 154 }[planKey];
  await control(subId, "backdate", toEnd);
  s = await state(token);
  check(`${tag} after ${months} month(s) the paid period ends: no code while the renewal is pending`, s.cycle === null);
  await control(subId, "renew");
  s = await state(token);
  const lockCount = (await db.collection("eventBenefitCycles").where("uid", "==", uid).get()).size;
  check(`${tag} renewal opens the next cycle`, s.cycle && !s.cycle.claimed, JSON.stringify(s.cycle));
  const c3 = await claim(token, "tt-e7");
  check(`${tag} renewed cycle issues its code`, c3.status === 200 && c3.data.benefit.ready);
  const locks = (await db.collection("eventBenefitCycles").where("uid", "==", uid).get()).docs.map((d) => d.data().cycleIndex).sort((a, b) => a - b);
  check(`${tag} one lock per used cycle, numbered from the subscription start`, lockCount === 2 && locks.join() === `0,1,${months === 1 ? 2 : months}`, locks.join());

  // ---- Cancellation ----
  const live = (await db.collection("eventBenefits").where("uid", "==", uid).get()).docs.map((d) => d.data());
  await control(subId, "cancel");
  s = await state(token);
  const after = (await db.collection("eventBenefits").where("uid", "==", uid).get()).docs.map((d) => d.data());
  const deletes = mockLog().filter((e) => e.service === "tickettailor" && e.kind === "discount_delete").map((e) => e.id);
  check(`${tag} cancellation: no cycle, no codes shown, claims refused`, s.cycle === null && s.benefits.length === 0 && (await claim(token, "tt-e1")).data?.error === "no_active_cycle");
  check(`${tag} cancellation: upcoming codes invalidated in Ticket Tailor and Firestore, records kept`, after.length === live.length && after.every((b) => b.status === "invalidated") && live.every((b) => deletes.includes(b.ticketTailorDiscountId)));
  check(`${tag} cancellation: cycle history kept`, (await db.collection("eventBenefitCycles").where("uid", "==", uid).get()).size === 3);
  const profile = (await db.doc(`profiles/${uid}`).get()).data();
  check(`${tag} cancellation: matching passive and paused`, profile.meta.searchStatus === "passive" && !!profile.meta.matchingPausedAt);
}

async function benefitEdgeCases() {
  // Ticket Tailor down at claim time: the cycle is used once, the code
  // stays "being prepared", and the scheduled retry finishes it.
  const uid = "bm-ttfail";
  await reset(uid);
  const token = await tokenFor(uid);
  await pay(token, uid, "monthly");
  fs.writeFileSync(TT_FAIL, "1");
  const r = await claim(token, "tt-e1");
  const doc = (await db.collection("eventBenefits").where("uid", "==", uid).get()).docs[0]?.data();
  check("[tt down] claim accepted, code waits for Ticket Tailor", r.status === 200 && r.data.benefit.ready === false && doc?.status === "external_sync_failed");
  check("[tt down] the cycle is still used once", (await claim(token, "tt-e2")).data?.error === "cycle_already_claimed");
  fs.rmSync(TT_FAIL);
  const scan = await adminScan("/api/admin/billing/run-due-event-benefits");
  const fixed = (await db.collection("eventBenefits").where("uid", "==", uid).get()).docs[0].data();
  check("[tt down] scheduled retry activates it, without issuing anything new", scan.ok && fixed.status === "active" && fixed.code === doc.code && ttCreatesFor(doc.code).length === 1, JSON.stringify(scan.result));
  const s = await state(token);
  check("[tt down] member now sees the code", s.benefits.length === 1 && s.benefits[0].ready);

  // A code from the earlier one-per-event engine stays valid and visible.
  const legacyUid = "bm-legacy";
  await reset(legacyUid);
  const lt = await tokenFor(legacyUid);
  await pay(lt, legacyUid, "monthly");
  const legacyDoc = {
    uid: legacyUid, ticketTailorEventId: "tt-e7", stripeSubscriptionId: "sub_old", createdAt: new Date(), validUntil: new Date(`${EVENTS["tt-e7"].eventDate}T21:59:59Z`),
    percentage: 20, ticketTailorDiscountId: "dc_legacy", code: "JS-LEGACY", status: "active", invalidatedAt: null, invalidatedReason: null,
  };
  await db.doc(`eventBenefits/${legacyUid}_tt-e7`).set(legacyDoc);
  let ls = await state(lt);
  check("[legacy code] still shown to the member", ls.benefits.some((b) => b.code === "JS-LEGACY" && b.ready));
  check("[legacy code] its event isn't offered again", !ls.claimableEvents.some((e) => e.ticketTailorEventId === "tt-e7"));
  check("[legacy code] a second code for that event is refused", (await claim(lt, "tt-e7")).data?.error === "event_already_has_code");
  check("[legacy code] the monthly code is still available for another event", (await claim(lt, "tt-e1")).status === 200);
  const legacyAfter = (await db.doc(`eventBenefits/${legacyUid}_tt-e7`).get()).data();
  check("[legacy code] record untouched", legacyAfter.code === "JS-LEGACY" && legacyAfter.status === "active" && legacyAfter.cycleKey === undefined);

  // Access control.
  check("[access] not signed in: 401", (await api(null, "GET", "/api/member/event-benefit")).status === 401);
  const free = await tokenFor("intro-finalized");
  const fs0 = await state(free);
  check("[access] community member without membership: no cycle, no claim", fs0.cycle === null && (await claim(free, "tt-e1")).data?.error === "no_active_cycle");
}

// ---------------------------------------------------------- B. matching
function completeProfile(uid, over = {}) {
  return {
    visible: {
      firstName: "Prueba", gender: "mujer", city: "Madrid", profession: "Médica", educationLevel: "universidad", heightCm: 165,
      languages: ["es"], hasChildren: false, hasYoungChildren: false, childrenCount: null, childrenBirthYears: null,
      wantsFutureChildren: "no", relationshipIntention: "relacion_seria", smoking: "no", drinking: "socialmente", activityLevel: "activo",
      market: "madrid", marketAvailability: "lives_in_market",
    },
    private: { birthDate: new Date("1978-05-20T00:00:00Z"), incomeRange: "40k_80k" },
    dealbreakers: {
      gendersSought: ["hombre"], ageMin: 45, ageMax: 60, maxDistance: "misma_ciudad",
      relationshipIntentionsAccepted: ["relacion_seria"], smokingAccepted: ["no"], partnerYoungChildrenMatters: false,
    },
    photos: [`profiles/${uid}/a.jpg`],
    presentation: { status: "approved", generatedText: "Texto de prueba.", prompts: {} },
    ...over,
  };
}
async function makeComplete(uid, finalized) {
  const ref = db.doc(`profiles/${uid}`);
  const current = (await ref.get()).data();
  const full = completeProfile(uid);
  await ref.set({
    ...current, ...full,
    visible: { ...current.visible, ...full.visible },
    dealbreakers: { ...(current.dealbreakers ?? {}), ...full.dealbreakers },
    presentation: { ...(current.presentation ?? {}), ...full.presentation },
    meta: {
      ...current.meta, aboutMeComplete: true, photosComplete: true, preferencesComplete: true, presentationComplete: true,
      profileStatus: "active_for_matching", onboardingFinalized: finalized, onboardingStepIndex: 9,
    },
  });
}
const meta = async (uid) => (await db.doc(`profiles/${uid}`).get()).data().meta;
const memberRun = async (uid, periodDate) => {
  const id = `anniv_${uid}_${madridYMD(periodDate)}`;
  const run = await db.doc(`matchingCycles/${id}/memberRuns/${uid}`).get();
  return { id, run: run.exists ? run.data() : null, cycle: (await db.doc(`matchingCycles/${id}`).get()).data() ?? null };
};

async function matchingJourneys() {
  // 1. Profile first, then pay.
  const a = "mt-profile-first";
  await reset(a);
  const ta = await tokenFor(a);
  await db.doc(`profiles/${a}`).set({ ...completeProfile(a), meta: {
    onboardingStepIndex: 9, aboutMeComplete: true, photosComplete: true, preferencesComplete: true, presentationComplete: true,
    profileStatus: "active_for_matching", onboardingFinalized: true, personId: a, searchStatus: "passive", duplicateStatus: "clear",
    duplicateOf: null, pendingLegacyActivation: false, legacyImportId: null, matchingAnchorAt: null, matchingSubscriptionId: null,
    matchingPeriodsProcessed: 0, nextMatchingDueAt: null, createdAt: new Date(), updatedAt: new Date(),
  } });
  const subA = await pay(ta, a, "three_month");
  let m = await meta(a);
  check("[profile first] payment turns on active search", m.searchStatus === "active_search" && m.matchingPeriodsProcessed === 0);
  let scan = await adminScan("/api/admin/matching/run-due-cycle");
  m = await meta(a);
  let r = await memberRun(a, m.matchingAnchorAt.toDate());
  check("[profile first] first scan serves period 1", m.matchingPeriodsProcessed === 1 && r.run?.status === "completed" && !m.matchingPausedAt, JSON.stringify(scan.result));

  // 2. Pay first, then complete the profile.
  const b = "mt-pay-first";
  await reset(b);
  const tb = await tokenFor(b);
  await pay(tb, b, "monthly");
  m = await meta(b);
  check("[pay first] payment activates membership: active search, dashboard data available", m.searchStatus === "active_search" && (await state(tb)).cycle !== null);
  scan = await adminScan("/api/admin/matching/run-due-cycle");
  m = await meta(b);
  r = await memberRun(b, m.matchingAnchorAt.toDate());
  check("[pay first] incomplete profile: not matched, period kept, marked paused", m.matchingPeriodsProcessed === 0 && !!m.matchingPausedAt && !r.cycle, JSON.stringify(scan.result));
  scan = await adminScan("/api/admin/matching/run-due-cycle");
  check("[pay first] repeated scans stay paused and never freeze a cycle", (await meta(b)).matchingPeriodsProcessed === 0 && !(await memberRun(b, m.matchingAnchorAt.toDate())).cycle);

  // The member can't clear the pause or force their own period from the browser.
  const denied = await fetch(`${FS_EMU}/v1/projects/${project}/databases/(default)/documents/profiles/${b}?updateMask.fieldPaths=meta.matchingPausedAt`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${tb}` },
    body: JSON.stringify({ fields: { meta: { mapValue: { fields: { matchingPausedAt: { nullValue: null } } } } } }),
  });
  check("[pay first] client write to the pause flag is rejected by Firestore rules", denied.status === 403, String(denied.status));

  await makeComplete(b, false);
  let re = await api(tb, "POST", "/api/member/matching/reevaluate");
  check("[pay first] complete but not finalized (no consent yet): still paused", re.data?.paused === true && (await meta(b)).matchingPeriodsProcessed === 0);
  check("[pay first] consent recorded", (await api(tb, "POST", "/api/member/introductions-consent", { introductionsConsent: true })).status === 200);
  await db.doc(`profiles/${b}`).update({ "meta.onboardingFinalized": true });
  re = await api(tb, "POST", "/api/member/matching/reevaluate");
  m = await meta(b);
  r = await memberRun(b, m.matchingAnchorAt.toDate());
  check("[pay first] finalizing re-evaluates at once: matched for the current period", re.data?.advanced === true && m.matchingPeriodsProcessed === 1 && !m.matchingPausedAt && r.run?.status === "completed", JSON.stringify(re.data));
  re = await api(tb, "POST", "/api/member/matching/reevaluate");
  scan = await adminScan("/api/admin/matching/run-due-cycle");
  check("[pay first] repeat calls and scans are no-ops (idempotent)", re.data?.advanced === false && (await meta(b)).matchingPeriodsProcessed === 1);
  check("[access] reevaluate requires sign-in", (await api(null, "POST", "/api/member/matching/reevaluate")).status === 401);

  // 3. A cycle frozen by the old bug is reopened and served.
  const c = "mt-frozen";
  await reset(c);
  const tc = await tokenFor(c);
  await db.doc(`profiles/${c}`).set({ ...completeProfile(c), meta: { ...(await db.doc(`profiles/${a}`).get()).data().meta, personId: c, searchStatus: "passive", matchingAnchorAt: null, matchingSubscriptionId: null, matchingPeriodsProcessed: 0, nextMatchingDueAt: null, matchingPausedAt: null } });
  await pay(tc, c, "monthly");
  m = await meta(c);
  const frozenId = `anniv_${c}_${madridYMD(m.matchingAnchorAt.toDate())}`;
  await db.doc(`matchingCycles/${frozenId}`).set({
    id: frozenId, mode: "member_period", status: "completed", config: { allowlistPersonIds: [c], maxProposalsPerMember: 3, maxMembersPerRun: 1 },
    createdAt: new Date(), startedAt: new Date(), completedAt: new Date(), error: null,
    stats: { recipientsConsidered: 0, recipientsCompleted: 0, proposalsCreated: 0, recipientsWithZeroProposals: 0 },
  });
  await adminScan("/api/admin/matching/run-due-cycle");
  m = await meta(c);
  r = await memberRun(c, m.matchingAnchorAt.toDate());
  check("[frozen cycle] old zero-recipient cycle reopened and served", m.matchingPeriodsProcessed === 1 && r.run?.status === "completed" && r.cycle.stats.recipientsConsidered === 1);

  // 4. Profile change while paying: becomes ineligible, then eligible again.
  const anchor = new Date(Date.now() - 70 * 86400000);
  const periodDate = (n) => { const d = new Date(anchor); const y = Number(madridYMD(d).slice(0, 4)); const mo = Number(madridYMD(d).slice(5, 7)) - 1 + n; const day = Number(madridYMD(d).slice(8, 10)); return new Date(Date.UTC(y + Math.floor(mo / 12), ((mo % 12) + 12) % 12, day)); };
  await db.doc(`profiles/${a}`).update({ "meta.matchingAnchorAt": Timestamp.fromDate(anchor), "meta.matchingPeriodsProcessed": 1, "meta.nextMatchingDueAt": periodDate(1), photos: [] });
  await adminScan("/api/admin/matching/run-due-cycle");
  m = await meta(a);
  check("[profile change] removing required photos pauses matching", m.matchingPeriodsProcessed === 1 && !!m.matchingPausedAt);
  await db.doc(`profiles/${a}`).update({ photos: [`profiles/${a}/a.jpg`] });
  re = await api(ta, "POST", "/api/member/matching/reevaluate");
  m = await meta(a);
  check("[profile change] fixing it resumes at the current period, no backlog burst", re.data?.advanced === true && m.matchingPeriodsProcessed === 3 && !m.matchingPausedAt && madridYMD(m.nextMatchingDueAt.toDate()) === madridYMD(periodDate(3)), `processed=${m.matchingPeriodsProcessed}`);

  // 5. Cancellation pauses; a new subscription restarts cleanly.
  await control(subA, "cancel");
  m = await meta(a);
  check("[cancel] cancellation: passive and paused", m.searchStatus === "passive" && !!m.matchingPausedAt);
  await adminScan("/api/admin/matching/run-due-cycle");
  check("[cancel] scans ignore a cancelled member", (await meta(a)).matchingPeriodsProcessed === 3);
  await pay(ta, a, "monthly");
  m = await meta(a);
  check("[resubscribe] new subscription: fresh clock, pause cleared", m.searchStatus === "active_search" && m.matchingPeriodsProcessed === 0 && !m.matchingPausedAt);
  await adminScan("/api/admin/matching/run-due-cycle");
  check("[resubscribe] served at once", (await meta(a)).matchingPeriodsProcessed === 1);
}

async function main() {
  if (fs.existsSync(TT_FAIL)) fs.rmSync(TT_FAIL);
  await seedEvents();
  for (const plan of ["monthly", "three_month", "six_month"]) await planJourney(plan);
  await benefitEdgeCases();
  await matchingJourneys();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
