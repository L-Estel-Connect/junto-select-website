/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// "Datos de contacto" on the admin candidate page (/admin/members/[uid]),
// against the local build and the emulators:
//   set -a; . ./.env.local; set +a
//   NODE_PATH=$(npm root -g) node scripts/local-test/member-contact-ui.cjs
// Seeds invented "mc-" candidates whose email and phone live in different
// records (profile, users doc, Auth only, client file, matchmaking request,
// Ticket Tailor attendee, nothing at all), checks what the page shows,
// that "No facilitado" appears where nothing exists, that the Membresía
// block is gone, that only an admin gets the data, and that no record was
// changed by viewing it. Screenshots go to .local-test/screens/contacto-*.png.
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
const ADMIN_EMAIL = (process.env.ADMIN_ALLOWLIST_EMAILS || "").split(",")[0].trim();
const EVENT_ID = "mc-event";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const ts = (iso) => Timestamp.fromDate(new Date(iso));
function profile(uid, name, phone) {
  return {
    visible: {
      firstName: name, gender: "hombre", city: "Madrid", profession: "Arquitecto", educationLevel: "universidad", heightCm: 180,
      languages: ["espanol"], hasChildren: false, hasYoungChildren: false, wantsFutureChildren: "no",
      relationshipIntention: "relacion_seria", smoking: "no", drinking: "socialmente", activityLevel: "activo",
      market: "madrid", marketAvailability: "lives_in_market",
    },
    private: { birthDate: ts(`${new Date().getUTCFullYear() - 53}-03-01T00:00:00Z`), incomeRange: null },
    dealbreakers: {
      gendersSought: ["mujer"], ageMin: 45, ageMax: 58, maxDistance: "sin_limite", relationshipIntentionsAccepted: ["relacion_seria"],
      smokingAccepted: ["no"], partnerYoungChildrenMatters: false,
    },
    preferences: { heightMinCm: null, heightMaxCm: null, drinkingAccepted: [], activityLevelsPreferred: [] },
    photos: [`profiles/${uid}/photos/0.jpg`],
    presentation: { status: "approved", approvedText: `${name} es tranquilo.`, draftText: "", rejectionReason: null },
    contactPreferences: { preferredMethod: phone ? "whatsapp" : null, additionalMethods: [], phone, instagram: null, linkedin: null },
    meta: {
      onboardingStepIndex: 9, aboutMeComplete: true, photosComplete: true, preferencesComplete: true, presentationComplete: true,
      profileStatus: "active_for_matching", onboardingFinalized: true, searchStatus: "passive", duplicateStatus: "clear",
      duplicateOf: null, personId: uid, pendingLegacyActivation: false, legacyImportId: null,
      createdAt: ts("2026-05-01T10:00:00Z"), updatedAt: ts("2026-09-20T10:00:00Z"),
    },
  };
}

// uid, name, auth email, users doc?, profile phone
const PEOPLE = [
  ["mc-carlos", "Carlos", "carlos.mc@example.test", true, "+34 600 123 456"],
  ["mc-authonly", "Pablo", "Pablo.MC@example.test", false, null],
  ["mc-nothing", "Luis", null, false, null],
];

async function seed() {
  for (const [uid, name, email, usersDoc, phone] of PEOPLE) {
    await auth.deleteUser(uid).catch(() => {});
    await auth.createUser({ uid, ...(email ? { email, emailVerified: true } : {}) });
    if (usersDoc) await db.doc(`users/${uid}`).set({ email, createdAt: ts("2026-05-01T10:00:00Z"), role: "member" });
    else await db.doc(`users/${uid}`).delete();
    await db.doc(`profiles/${uid}`).set(profile(uid, name, phone));
  }
  // Carlos is also a client: same phone written differently (deduped) and a request with a second phone.
  await db.doc("clients/mc-client").set({ email: "carlos.mc@example.test", phone: "600123456", firstName: "Carlos", status: "activo", createdAt: ts("2026-10-15T10:00:00Z"), createdBy: "mc-test" });
  await db.doc("matchmakingInquiries/mc-inq").set({ email: "carlos.mc@example.test", telefono: "699 000 111", nombre: "Carlos", status: "cliente", createdAt: ts("2026-10-15T09:00:00Z") });
  // Pablo's only phone is his Ticket Tailor ticket.
  await db.doc(`eventParticipants/${EVENT_ID}_pablo`).set({ eventId: EVENT_ID, normalizedEmail: "pablo.mc@example.test", firstName: "Pablo", lastName: "MC", phone: "+34 655 444 333", status: "imported" });
}

async function cleanup() {
  for (const [uid] of PEOPLE) {
    await db.doc(`profiles/${uid}`).delete();
    await db.doc(`users/${uid}`).delete();
    await auth.deleteUser(uid).catch(() => {});
  }
  await db.doc("clients/mc-client").delete();
  await db.doc("matchmakingInquiries/mc-inq").delete();
  await db.doc(`eventParticipants/${EVENT_ID}_pablo`).delete();
}

async function snapshot() {
  const paths = [
    ...PEOPLE.flatMap(([uid]) => [`profiles/${uid}`, `users/${uid}`]),
    "clients/mc-client", "matchmakingInquiries/mc-inq", `eventParticipants/${EVENT_ID}_pablo`,
  ];
  const snaps = await Promise.all(paths.map((p) => db.doc(p).get()));
  return JSON.stringify(snaps.map((s) => [s.ref.path, s.exists ? s.data() : null]));
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

async function adminLogin(page) {
  const user = await auth.getUserByEmail(ADMIN_EMAIL).catch(() => auth.createUser({ email: ADMIN_EMAIL, emailVerified: true }));
  const t = await idToken(user.uid);
  const stored = {
    uid: user.uid, email: ADMIN_EMAIL, emailVerified: true, isAnonymous: false, providerData: [],
    stsTokenManager: { refreshToken: t.refreshToken, accessToken: t.idToken, expirationTime: Date.now() + 3500 * 1000 },
    createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey: API_KEY, appName: "[DEFAULT]",
  };
  await page.goto(`${APP}/admin/login`, { waitUntil: "networkidle" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`firebase:authUser:${API_KEY}:[DEFAULT]`, JSON.stringify(stored)]);
  const session = await page.request.post(`${APP}/api/admin/session`, { data: { idToken: t.idToken } });
  if (!session.ok()) throw new Error(`admin session refused: ${session.status()}`);
}

async function contactBox(page, uid) {
  await page.goto(`${APP}/admin/members/${uid}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Datos de contacto" }).waitFor({ timeout: 15000 });
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Datos de contacto" }) });
  return { section, text: await section.innerText(), page: await page.locator("main, body").first().innerText() };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await cleanup();
  await seed();
  const before = await snapshot();

  // Only an admin gets contact details.
  const anon = await fetch(`${APP}/api/admin/dashboard/members/mc-carlos`);
  check("API refuses an anonymous call", anon.status === 401, String(anon.status));
  const member = await idToken("mc-authonly");
  const asMember = await fetch(`${APP}/api/admin/dashboard/members/mc-carlos`, { headers: { authorization: `Bearer ${member.idToken}` } });
  check("API refuses a signed-in candidate", asMember.status === 401, String(asMember.status));
  const pub = await fetch(`${APP}/api/admin/candidates`);
  check("candidate list API refuses an anonymous call", pub.status === 401 || pub.status === 403, String(pub.status));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-ES" });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: APP });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await adminLogin(page);

  // Carlos: profile phone, client file (same number, deduped) and a request with another number.
  let r = await contactBox(page, "mc-carlos");
  check("Carlos: section is above Perfil", r.page.indexOf("DATOS DE CONTACTO") >= 0 && r.page.indexOf("DATOS DE CONTACTO") < r.page.indexOf("PERFIL"), "");
  check("Carlos: account email shown", r.text.includes("carlos.mc@example.test") && r.text.includes("Email de su cuenta"));
  check("Carlos: profile phone with country code", r.text.includes("+34 600 123 456") && r.text.includes("Indicado en su perfil"));
  check("Carlos: client file's copy of the same number not repeated", !r.text.includes("600123456"));
  check("Carlos: request phone listed as another phone", r.text.includes("699 000 111") && r.text.includes("Solicitud de matchmaking"));
  check("Carlos: preferred method", r.text.includes("WhatsApp"));
  check("Carlos: link to the client file", (await r.section.getByRole("link", { name: "ver ficha" }).getAttribute("href")) === "/admin/clientes/mc-client");
  check("Carlos: no Membresía / Stripe block", !/MEMBRES[IÍ]A/.test(r.page) && !r.page.includes("Stripe"));
  await r.section.getByRole("button", { name: "Copiar email" }).click();
  check("Carlos: Copiar puts the email on the clipboard", (await page.evaluate(() => navigator.clipboard.readText())) === "carlos.mc@example.test");
  await r.section.getByRole("button", { name: "Copiar teléfono" }).click();
  check("Carlos: Copiar puts the phone on the clipboard", (await page.evaluate(() => navigator.clipboard.readText())) === "+34 600 123 456");
  check("Carlos: button says Copiado", (await r.section.getByRole("button", { name: "Copiar teléfono" }).innerText()) === "Copiado");
  await page.screenshot({ path: `${OUT}/contacto-carlos.png`, fullPage: false });

  // Pablo: no users doc (email only in Auth), phone only on a Ticket Tailor ticket.
  r = await contactBox(page, "mc-authonly");
  check("Pablo: email read from Firebase Auth", r.text.toLowerCase().includes("pablo.mc@example.test"));
  check("Pablo: Ticket Tailor phone shown with its source", r.text.includes("+34 655 444 333") && r.text.includes("Ticket Tailor"));
  await page.screenshot({ path: `${OUT}/contacto-pablo.png`, fullPage: false });

  // Luis: nothing on record anywhere.
  r = await contactBox(page, "mc-nothing");
  check("Luis: email and phone both say No facilitado", (r.text.match(/No facilitado/g) || []).length === 2, r.text.replace(/\n/g, " | "));
  check("Luis: no copy buttons when nothing to copy", (await r.section.getByRole("button").count()) === 0);
  await page.screenshot({ path: `${OUT}/contacto-luis.png`, fullPage: false });

  // Phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  r = await contactBox(page, "mc-carlos");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("mobile: no horizontal scroll", !overflow);
  await page.screenshot({ path: `${OUT}/contacto-carlos-mobile.png`, fullPage: false });

  check("no page errors", errors.length === 0, errors.join(" | "));
  check("viewing changed no record", (await snapshot()) === before);
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
