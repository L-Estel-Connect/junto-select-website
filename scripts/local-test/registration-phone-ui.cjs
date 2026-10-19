/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Required phone when a NEW candidate finishes registration, against the
// local build and the emulators:
//   set -a; . ./.env.local; set +a
//   NODE_PATH=$(npm root -g) node scripts/local-test/registration-phone-ui.cjs
// (The full new-candidate journey, phone included, is in onboarding-ui.cjs.)
// Checks: a phone already on the profile is prefilled (country code split
// out) and saved unchanged; "Otro país" takes a full international number;
// the consent API refuses an unfinished profile with no phone; an EXISTING
// finalized candidate without a phone keeps using and editing their profile,
// is never asked for one, and nothing on their profile changes.
// Screenshots go to .local-test/screens/telefono-*.png.
const fs = require("node:fs");
const { chromium } = require("playwright");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const project = process.env.GCLOUD_PROJECT || "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !project.startsWith("demo-")) {
  console.error("Refusing to run outside the emulators.");
  process.exit(1);
}
initializeApp({ projectId: project });
const auth = getAuth();
const db = getFirestore();

const APP = "http://localhost:3000";
const OUT = ".local-test/screens";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const ts = (iso) => Timestamp.fromDate(new Date(iso));
function profile(uid, name, { phone = null, finalized = false } = {}) {
  return {
    visible: {
      firstName: name, gender: "mujer", city: "Madrid", profession: "Médica", educationLevel: "universidad", heightCm: 165,
      languages: ["espanol"], hasChildren: false, hasYoungChildren: false, wantsFutureChildren: "no",
      relationshipIntention: "relacion_seria", smoking: "no", drinking: "socialmente", activityLevel: "activo",
      market: "madrid", marketAvailability: "lives_in_market",
    },
    private: { birthDate: ts("1975-03-01T00:00:00Z"), incomeRange: "40k_80k" },
    dealbreakers: {
      gendersSought: ["hombre"], ageMin: 45, ageMax: 60, maxDistance: "sin_limite", relationshipIntentionsAccepted: ["relacion_seria"],
      smokingAccepted: ["no"], partnerYoungChildrenMatters: false,
    },
    preferences: { heightMinCm: null, heightMaxCm: null, drinkingAccepted: [], activityLevelsPreferred: [] },
    photos: [`profiles/${uid}/photos/0.jpg`],
    presentation: { status: "approved", approvedText: `${name} es curiosa y tranquila.`, draftText: "", rejectionReason: null },
    contactPreferences: { preferredMethod: null, additionalMethods: [], phone, instagram: null, linkedin: null },
    meta: {
      onboardingStepIndex: 16, aboutMeComplete: true, photosComplete: true, preferencesComplete: true, presentationComplete: true,
      profileStatus: finalized ? "active_for_matching" : "draft", onboardingFinalized: finalized, searchStatus: "passive",
      requestedService: "passive", duplicateStatus: "clear", duplicateOf: null, personId: uid, pendingLegacyActivation: false,
      legacyImportId: null, createdAt: ts("2026-05-01T10:00:00Z"), updatedAt: ts("2026-09-20T10:00:00Z"),
    },
  };
}

const PEOPLE = {
  "tel-prefilled": ["Marta", { phone: "+351 912 345 678" }],
  "tel-other": ["Sara", {}],
  "tel-api": ["Nuria", {}],
  "tel-existing": ["Elena", { finalized: true }],
};
const emailOf = (uid) => `${uid}@example.test`;

async function reset() {
  for (const [uid, [name, opts]] of Object.entries(PEOPLE)) {
    await auth.deleteUser(uid).catch(() => {});
    await auth.createUser({ uid, email: emailOf(uid), emailVerified: true });
    await db.doc(`users/${uid}`).set({ email: emailOf(uid), createdAt: ts("2026-05-01T10:00:00Z"), role: "member" });
    await db.doc(`profiles/${uid}`).set(profile(uid, name, opts));
    await db.doc(`introductionsConsent/${uid}`).delete();
  }
}
async function cleanup() {
  for (const uid of Object.keys(PEOPLE)) {
    await db.doc(`profiles/${uid}`).delete();
    await db.doc(`users/${uid}`).delete();
    await db.doc(`introductionsConsent/${uid}`).delete();
    await auth.deleteUser(uid).catch(() => {});
  }
}
const profileOf = async (uid) => (await db.doc(`profiles/${uid}`).get()).data();
async function waitFor(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

async function idToken(uid) {
  const custom = await auth.createCustomToken(uid);
  const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  return res.json();
}
async function signIn(page, uid) {
  const t = await idToken(uid);
  const stored = {
    uid, email: emailOf(uid), emailVerified: true, isAnonymous: false, providerData: [],
    stsTokenManager: { refreshToken: t.refreshToken, accessToken: t.idToken, expirationTime: Date.now() + 3500 * 1000 },
    createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey: API_KEY, appName: "[DEFAULT]",
  };
  await page.goto(`${APP}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`firebase:authUser:${API_KEY}:[DEFAULT]`, JSON.stringify(stored)]);
}
async function consent(uid) {
  const t = await idToken(uid);
  return fetch(`${APP}/api/member/introductions-consent`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${t.idToken}` },
    body: JSON.stringify({ introductionsConsent: true }),
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await reset();
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async (uid, viewport = { width: 1280, height: 900 }) => {
    const ctx = await browser.newContext({ viewport, locale: "es-ES" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await signIn(page, uid);
    return page;
  };

  // Consent API: an unfinished profile without a phone is refused, server-side.
  let res = await consent("tel-api");
  check("API: unfinished profile without phone refused", res.status === 400 && (await res.json()).error === "phone_required", String(res.status));
  check("API: no consent written", !(await db.doc("introductionsConsent/tel-api").get()).exists);
  await db.doc("profiles/tel-api").update({ "contactPreferences.phone": "+34 600 111 222" });
  res = await consent("tel-api");
  check("API: accepted once the phone is there", res.status === 200, String(res.status));

  // Prefilled from the existing profile; finishing doesn't ask again or change it.
  let page = await newPage("tel-prefilled");
  await page.goto(`${APP}/member/profile`, { waitUntil: "domcontentloaded" });
  await page.getByText("Acepto participar en las introducciones privadas").waitFor({ timeout: 20000 });
  check("prefill: country split out (Portugal)", (await page.getByLabel("Prefijo del país").inputValue()) === "+351");
  check("prefill: number filled", (await page.getByLabel("Tu teléfono").inputValue()) === "912 345 678");
  check("prefill: only one phone field (never asked twice)", (await page.locator("input[type=tel]").count()) === 1);
  await page.screenshot({ path: `${OUT}/telefono-1-prefill.png`, fullPage: true });
  await page.getByText("Acepto participar en las introducciones privadas").click();
  await page.getByRole("button", { name: "Guardar y finalizar" }).click();
  let p = await waitFor(async () => ((await profileOf("tel-prefilled"))?.meta?.onboardingFinalized ? profileOf("tel-prefilled") : null));
  check("prefill: finished", p?.meta?.onboardingFinalized === true);
  check("prefill: phone unchanged", p?.contactPreferences?.phone === "+351 912 345 678", p?.contactPreferences?.phone);

  // "Otro país": full international number, saved as typed; a bad one is refused first.
  page = await newPage("tel-other", { width: 390, height: 844 });
  await page.goto(`${APP}/member/profile`, { waitUntil: "domcontentloaded" });
  await page.getByText("Acepto participar en las introducciones privadas").waitFor({ timeout: 20000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("mobile: no horizontal scroll", !overflow);
  await page.getByLabel("Prefijo del país").selectOption("otro");
  await page.getByLabel("Tu teléfono").fill("50 123 4567");
  await page.getByText("Acepto participar en las introducciones privadas").click();
  await page.getByRole("button", { name: "Guardar y finalizar" }).click();
  await page.getByText("empezando por + y el prefijo").waitFor({ timeout: 10000 });
  check("otro: number without + refused", (await profileOf("tel-other"))?.meta?.onboardingFinalized === false);
  await page.getByLabel("Tu teléfono").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/telefono-2-otro-error-mobile.png`, fullPage: false });
  await page.getByLabel("Tu teléfono").fill("+971 50 123 4567");
  await page.getByRole("button", { name: "Guardar y finalizar" }).click();
  p = await waitFor(async () => ((await profileOf("tel-other"))?.meta?.onboardingFinalized ? profileOf("tel-other") : null));
  check("otro: finished with the international number", p?.contactPreferences?.phone === "+971 50 123 4567", p?.contactPreferences?.phone);

  // Existing finalized candidate without a phone: nothing asked, nothing changed.
  const before = JSON.stringify(await profileOf("tel-existing"));
  page = await newPage("tel-existing");
  await page.goto(`${APP}/member`, { waitUntil: "domcontentloaded" });
  await page.getByText("Tu perfil privado").waitFor({ timeout: 20000 });
  check("existing: private profile page opens", page.url().endsWith("/member"));
  check("existing: no phone field or request", (await page.locator("input[type=tel]").count()) === 0 && (await page.getByText(/indica tu teléfono|obligatorio/).count()) === 0);
  await page.getByRole("link", { name: "Editar Lo que buscas" }).click();
  await page.waitForURL(`${APP}/member/profile/preferences`, { timeout: 15000 });
  check("existing: can open an edit page", true);
  await page.goto(`${APP}/member/profile/about`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  check("existing: Sobre ti edit stays put (no redirect)", page.url().endsWith("/member/profile/about"), page.url());
  await page.goto(`${APP}/member/profile/contact`, { waitUntil: "domcontentloaded" });
  await page.getByText("¿Cómo prefieres que te contacten?").waitFor({ timeout: 15000 });
  check("existing: contact page still optional and reachable", true);
  check("existing: profile unchanged by visiting", JSON.stringify(await profileOf("tel-existing")) === before);

  check("no page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
  await cleanup();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
