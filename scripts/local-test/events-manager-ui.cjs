/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Browser walk-through of the Events Manager, as the admin would use it,
// against the local build (emulators + mock Ticket Tailor). It creates the
// two initial events in the LOCAL emulator only:
//   1. 29 Oct 2026: paste the Ticket Tailor link -> Importar -> review ->
//      Entradas disponibles -> 20 % on -> Guardar -> Publicar.
//   2. 26 Nov 2026: create manually -> Próximamente -> Guardar -> Publicar
//      (no venue, no price, no ticket link).
// Then checks /eventos and the homepage and saves screenshots to
// .local-test/screens/events-*.png.
//   set -a; . ./.env.local; set +a
//   node scripts/local-test/events-manager-ui.cjs
const fs = require("node:fs");
const { chromium } = require("playwright");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const project = process.env.GCLOUD_PROJECT || "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !project.startsWith("demo-")) {
  console.error("Refusing to run outside the emulators.");
  process.exit(1);
}
initializeApp({ projectId: project });
const db = getFirestore();

const APP = "http://localhost:3000";
const ADMIN_EMAIL = (process.env.ADMIN_ALLOWLIST_EMAILS || "").split(",")[0].trim();
const OUT = ".local-test/screens";
const TITLE = "Junto Select Signature";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function resetInitialEvents() {
  const snap = await db.collection("eligibleTicketTailorEvents").get();
  for (const d of snap.docs) {
    if (d.id === "2439069" || (d.id.startsWith("manual_") && d.data().label === TITLE)) await d.ref.delete();
  }
}

// The real login button opens Google's sign-in popup, which needs
// apis.google.com; this sandbox can't reach it. So the test signs the
// allowlisted admin into the auth emulator directly and stores the session
// the way the Firebase web SDK does, then opens the admin session exactly as
// the login page would (POST /api/admin/session with the ID token).
async function adminLogin(page) {
  const user = await getAuth().getUserByEmail(ADMIN_EMAIL).catch(() => getAuth().createUser({ email: ADMIN_EMAIL, emailVerified: true }));
  const custom = await getAuth().createCustomToken(user.uid);
  const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const t = await res.json();
  const stored = {
    uid: user.uid, email: ADMIN_EMAIL, emailVerified: true, isAnonymous: false, providerData: [],
    stsTokenManager: { refreshToken: t.refreshToken, accessToken: t.idToken, expirationTime: Date.now() + 3500 * 1000 },
    createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey: API_KEY, appName: "[DEFAULT]",
  };
  await page.goto(`${APP}/admin/login`, { waitUntil: "networkidle" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`firebase:authUser:${API_KEY}:[DEFAULT]`, JSON.stringify(stored)]);
  const session = await page.request.post(`${APP}/api/admin/session`, { data: { idToken: t.idToken } });
  if (!session.ok()) throw new Error(`admin session refused: ${session.status()}`);
  await page.goto(`${APP}/admin`, { waitUntil: "networkidle" });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await resetInitialEvents();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-ES" });
  const page = await ctx.newPage();
  await adminLogin(page);
  check("admin: allowlisted account reaches the dashboard", page.url() === `${APP}/admin`);

  await page.getByRole("link", { name: "Eventos" }).first().click();
  await page.waitForURL(`${APP}/admin/eventos`);
  check("admin: Eventos in the menu opens the Events Manager", await page.getByRole("heading", { name: "Eventos", exact: true }).isVisible());

  // ---- 1. 29 October, from Ticket Tailor ----
  await page.getByRole("button", { name: "Nuevo evento desde Ticket Tailor" }).click();
  await page.locator("#tt-ref").fill("https://www.tickettailor.com/events/juntoselect/2439069");
  await page.getByRole("button", { name: "Importar datos" }).click();
  await page.getByText("Importado de Ticket Tailor:").waitFor();
  check("import: fills the date and time", (await page.locator("#ev-date").inputValue()) === "2026-10-29" && (await page.locator("#ev-start").inputValue()) === "20:00");
  check("import: fills the booking link", (await page.locator("#ev-checkout").inputValue()) === "https://www.tickettailor.com/events/juntoselect/2439069");
  check("import: suggests Entradas disponibles", (await page.locator("#ev-status").inputValue()) === "tickets_available");
  check("import: site description not overwritten by Ticket Tailor's", (await page.locator("#ev-desc").inputValue()) === "");
  check("import: Ticket Tailor description shown for reference", await page.getByText("Descripción en Ticket Tailor (solo referencia)").isVisible());
  await page.screenshot({ path: `${OUT}/events-1-import.png`, fullPage: true });

  // Review / edit, as Lara asked: a Signature event in Madrid.
  await page.locator("#ev-title").fill(TITLE);
  await page.locator("#ev-type").fill("Signature");
  await page.locator("#ev-city").fill("Madrid");
  await page.locator("#ev-desc").fill("");
  check("import: offers the Ticket Tailor image", await page.getByText("Imagen propia del evento").isVisible());
  // This sandbox can't load images from Ticket Tailor's servers, so the walk-through picks the default image.
  await page.getByText("Salón privado (por defecto)").click();
  await page.getByLabel("Ofrecer el 20 % a los miembros Select en este evento").check();
  check("benefit: ticket types come from the import", (await page.locator("#ev-tt-types").inputValue()) === "tt_mock1, tt_mock2");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByText("Guardado.").waitFor();
  const preview = page.frameLocator('iframe[title="Vista previa del evento"]');
  await preview.getByText(TITLE).first().waitFor({ timeout: 20000 });
  check("preview: shows the card before publishing", await preview.getByRole("link", { name: /Reservar/ }).count() === 1);
  await page.screenshot({ path: `${OUT}/events-2-saved-preview.png`, fullPage: true });
  await page.getByRole("button", { name: "Publicar en la web" }).first().click();
  await page.getByText("Publicado: ya aparece en Inicio y Encuentros.").first().waitFor();
  check("publish: done from the editor", true);

  // ---- 2. 26 November, without tickets yet ----
  await page.getByRole("button", { name: "Nuevo evento sin entradas todavía" }).click();
  check("manual: starts as Próximamente", (await page.locator("#ev-status").inputValue()) === "coming_soon");
  await page.locator("#ev-title").fill(TITLE);
  await page.locator("#ev-type").fill("Signature");
  await page.locator("#ev-date").fill("2026-11-26");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByText("Guardado.").waitFor();
  await preview.getByText("Próximamente").first().waitFor({ timeout: 20000 });
  check("preview: coming soon has no purchase link", (await preview.getByRole("link", { name: /Reservar/ }).count()) === 0);
  await page.getByRole("button", { name: "Publicar en la web" }).first().click();
  await page.getByText("Publicado: ya aparece en Inicio y Encuentros.").first().waitFor();
  await page.getByRole("button", { name: "Cerrar editor" }).click();
  await page.screenshot({ path: `${OUT}/events-3-list.png`, fullPage: true });

  const docs = (await db.collection("eligibleTicketTailorEvents").get()).docs.map((d) => d.data()).filter((d) => d.label === TITLE);
  const oct = docs.find((d) => d.eventDate === "2026-10-29");
  const nov = docs.find((d) => d.eventDate === "2026-11-26");
  check("record: 29 Oct stored under the Ticket Tailor number", oct?.ticketTailorEventId === "2439069" && oct.published === true && oct.memberBenefitEnabled === true);
  check("record: 26 Nov has no venue, price or ticket link", nov && nov.published === true && !nov.venuePublic && nov.priceFromEuros == null && !nov.ticketTailorCheckoutUrl && nov.ticketTailorLinked === false);

  // ---- Public pages ----
  const pub = await ctx.newPage();
  await pub.goto(`${APP}/eventos`);
  const cards = pub.locator("article", { hasText: TITLE });
  check("public /eventos: both events shown", (await cards.count()) === 2);
  const first = await cards.nth(0).innerText();
  const second = await cards.nth(1).innerText();
  check("public /eventos: in date order", /29 de octubre/i.test(first) && /26 de noviembre/i.test(second), `${first.slice(0, 60)} | ${second.slice(0, 60)}`);
  check("public /eventos: October links to Ticket Tailor checkout",
    (await cards.nth(0).getByRole("link", { name: /Reservar/ }).getAttribute("href")) === "https://www.tickettailor.com/events/juntoselect/2439069");
  check("public /eventos: November shows Próximamente, no purchase link", /Próximamente/i.test(second) && (await cards.nth(1).locator("a").count()) === 0);
  await pub.screenshot({ path: `${OUT}/events-4-encuentros.png`, fullPage: true });
  await pub.goto(`${APP}/`);
  check("public home: shows both upcoming events", (await pub.locator("article", { hasText: TITLE }).count()) === 2);
  const homeEvents = pub.locator("article", { hasText: TITLE }).first();
  await homeEvents.scrollIntoViewIfNeeded();
  await pub.screenshot({ path: `${OUT}/events-5-home.png`, fullPage: true });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", deviceScaleFactor: 2 });
  const pp = await phone.newPage();
  await pp.goto(`${APP}/eventos`);
  const overflow = await pp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check("public /eventos on a phone: no sideways scroll", !overflow);
  await pp.screenshot({ path: `${OUT}/events-6-encuentros-phone.png`, fullPage: true });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
