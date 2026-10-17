/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Reconnect screens in a real browser, against the local build + emulators:
//   set -a; . ./.env.local; set +a
//   NODE_PATH=$(npm root -g) node scripts/local-test/reconnect-ui.cjs
// Admin: the visible "Reconnect activado" switch and the Ticket Tailor CSV
// import (preview, then import). Participant page: before opening, closed,
// switched off, not on the list — never the generic error page.
// Uses event 91000888 and rcui.*@example.test, deleted at the start and end.
const fs = require("node:fs");
const path = require("node:path");
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
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const ADMIN_EMAIL = (process.env.ADMIN_ALLOWLIST_EMAILS || "").split(",")[0].trim();
const EV = "91000888";
const OUT = ".local-test/shots/reconnect";
const PEOPLE = ["rcui.ana@example.test", "rcui.bruno@example.test", "rcui.fuera@example.test"];

let failed = 0;
function check(name, ok, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const ymd = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(Date.now() + n * 864e5));

async function signIn(page, email, admin) {
  const user = await getAuth().getUserByEmail(email).catch(() => getAuth().createUser({ email, emailVerified: true }));
  const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: await getAuth().createCustomToken(user.uid), returnSecureToken: true }),
  });
  const t = await res.json();
  const stored = {
    uid: user.uid, email, emailVerified: true, isAnonymous: false, providerData: [],
    stsTokenManager: { refreshToken: t.refreshToken, accessToken: t.idToken, expirationTime: Date.now() + 3500e3 },
    createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey: API_KEY, appName: "[DEFAULT]",
  };
  await page.goto(`${APP}${admin ? "/admin/login" : "/"}`, { waitUntil: "networkidle" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`firebase:authUser:${API_KEY}:[DEFAULT]`, JSON.stringify(stored)]);
  if (admin) await page.request.post(`${APP}/api/admin/session`, { data: { idToken: t.idToken } });
}

async function cleanup() {
  await db.doc(`eligibleTicketTailorEvents/${EV}`).delete();
  for (const d of (await db.collection("eventParticipants").where("eventId", "==", EV).get()).docs) await d.ref.delete();
  for (const e of PEOPLE) {
    try {
      const u = await getAuth().getUserByEmail(e);
      await db.doc(`profiles/${u.uid}`).delete();
      await getAuth().deleteUser(u.uid);
    } catch {}
  }
}

async function participantPage(browser, email, label) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page, email, false);
  await page.goto(`${APP}/reconnect/${EV}`);
  await page.waitForFunction(() => !document.body.innerText.includes("Cargando"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: true });
  await page.close();
  return { text, errors };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await cleanup();
  await db.doc(`eligibleTicketTailorEvents/${EV}`).set({
    ticketTailorEventId: EV, label: "Prueba Reconnect UI", eventType: "Signature", eventDate: ymd(12), startTime: "20:00", endTime: "23:00",
    city: "Madrid", venuePublic: "", description: "", imageUrl: "/images/private-curated.png", priceFromEuros: null, publicStatus: "coming_soon",
    ticketTailorCheckoutUrl: "", memberBenefitEnabled: false, ticketTailorTicketTypeIds: [], reconnectEnabled: false, ticketTailorLinked: true,
    reconnectForceClosedAt: null, published: false, publishedAt: null, archivedAt: null, createdAt: new Date(), updatedAt: new Date(),
    lastSyncedAt: null, lastSyncResult: null,
  });
  const browser = await chromium.launch();

  // --- Admin: visible switch + CSV import.
  const admin = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signIn(admin, ADMIN_EMAIL, true);
  await admin.goto(`${APP}/admin/eventos`, { waitUntil: "networkidle" });
  const row = admin.locator(`article[data-event-id="${EV}"]`);
  await row.getByRole("button", { name: "Editar" }).click();
  const box = admin.getByLabel("Reconnect activado (después del evento)");
  check("Reconnect switch visible without opening Más opciones", await box.isVisible());
  check("Más opciones no longer holds it", (await admin.locator("details").first().locator("text=Reconnect activado").count()) === 0);
  await box.check();
  await box.scrollIntoViewIfNeeded();
  await admin.locator('section[aria-label="Editor de evento"]').screenshot({ path: `${OUT}/admin-editor.png` });
  await admin.getByRole("button", { name: "Guardar cambios" }).click();
  await admin.getByText("Guardado.").waitFor();
  check("saved: reconnectEnabled true", (await db.doc(`eligibleTicketTailorEvents/${EV}`).get()).data().reconnectEnabled === true);
  await admin.waitForTimeout(800);
  check("row says activado", (await row.innerText()).includes("Reconnect: activado"));

  const csv = path.resolve(OUT, "tickettailor-export.csv");
  fs.writeFileSync(csv, [
    "Order ID,Status,First name,Last name,Email,Attendee first name,Attendee last name,Attendee email",
    "or_1,Completed,Ana,García,rcui.ana@example.test,Ana,García,rcui.ana@example.test",
    "or_2,Completed,Bruno,Ruiz,RCUI.BRUNO@example.test,Bruno,Ruiz,rcui.bruno@example.test",
    "or_2,Completed,Bruno,Ruiz,rcui.bruno@example.test,,,",
    "or_3,Refunded,Diego,Sanz,rcui.diego@example.test,,,",
    "or_4,Completed,Fer,Gil,fer-sin-arroba,,,",
  ].join("\n"));
  await row.getByRole("button", { name: "Importar participantes" }).click();
  await row.locator('input[type="file"]').setInputFiles(csv);
  const preview = row.getByTestId("import-preview");
  await preview.waitFor();
  const pText = await preview.innerText();
  check("preview shows detected columns", pText.includes("Email ← «Attendee email»") && pText.includes("Nombre ← «Attendee first name»"), pText.split("\n")[0]);
  check("preview counts: 2 new, 1 repeat, 2 discarded", pText.includes("2 participantes nuevos") && pText.includes("1 entradas repetidas") && pText.includes("2 descartadas"), pText.split("\n")[1]);
  check("preview names the discarded lines", pText.includes("Línea 5: pedido cancelado") && pText.includes("Línea 6: email no válido"));
  check("nothing saved before confirming", (await db.collection("eventParticipants").where("eventId", "==", EV).get()).empty);
  await row.screenshot({ path: `${OUT}/admin-import-preview.png` });
  await preview.getByRole("button", { name: "Importar 2 participantes" }).click();
  await row.getByText("Importación hecha").waitFor();
  check("summary after import", (await row.innerText()).includes("2 participantes nuevos, 0 ya estaban importados, 2 filas descartadas"));
  check("2 participants stored", (await db.collection("eventParticipants").where("eventId", "==", EV).get()).size === 2);
  await row.locator('input[type="file"]').setInputFiles(csv);
  await preview.waitFor();
  check("re-import preview: nothing new", (await preview.innerText()).includes("0 participantes nuevos") && (await preview.getByRole("button", { name: "Nada nuevo que importar" }).isDisabled()));
  await row.locator("textarea").fill('[{"email":"rcui.json@example.test","firstName":"Jota"}]');
  await row.getByRole("button", { name: "Revisar" }).click();
  await preview.waitFor();
  check("older JSON format still accepted", (await preview.innerText()).includes("1 participantes nuevos"));
  await admin.close();

  // --- Participant page in each state (event in 12 days → not yet open).
  let r = await participantPage(browser, PEOPLE[0], "1-participante-antes");
  check("participant before opening: clear message with date", r.text.includes("Reconnect aún no está abierto") && r.text.includes("00:01"), r.text.slice(0, 160));
  check("no crash", r.errors.length === 0 && !r.text.includes("couldn’t load"), r.errors.join(" | "));
  r = await participantPage(browser, PEOPLE[2], "2-no-participante-antes");
  check("not on the list, before opening: same clear message, no crash", r.text.includes("Reconnect aún no está abierto") && r.errors.length === 0, r.text.slice(0, 160));

  await db.doc(`eligibleTicketTailorEvents/${EV}`).update({ eventDate: ymd(-1) });
  r = await participantPage(browser, PEOPLE[2], "3-no-participante-abierto");
  check("not on the list, while open: 'no ticket found', no crash", r.text.includes("No hemos encontrado tu entrada") && r.errors.length === 0, r.text.slice(0, 160));
  r = await participantPage(browser, PEOPLE[0], "4-participante-abierto");
  check("participant while open: activation form", /Reconnect/.test(r.text) && r.errors.length === 0 && !r.text.includes("aún no está abierto"), r.text.slice(0, 160));

  await db.doc(`eligibleTicketTailorEvents/${EV}`).update({ eventDate: ymd(-4) });
  r = await participantPage(browser, PEOPLE[0], "5-participante-cerrado");
  check("participant after 48 h: 'ha terminado'", r.text.includes("El periodo de Reconnect ha terminado") && r.errors.length === 0, r.text.slice(0, 160));

  await db.doc(`eligibleTicketTailorEvents/${EV}`).update({ eventDate: ymd(-1), reconnectEnabled: false });
  r = await participantPage(browser, PEOPLE[0], "6-desactivado");
  check("switched off: 'no está disponible para este evento'", r.text.includes("no está disponible para este evento") && r.errors.length === 0, r.text.slice(0, 160));
  r = await participantPage(browser, PEOPLE[2], "7-desactivado-no-participante");
  check("switched off, not on the list: same message, no crash", r.text.includes("no está disponible para este evento") && r.errors.length === 0, r.text.slice(0, 160));

  await browser.close();
  await cleanup();
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
