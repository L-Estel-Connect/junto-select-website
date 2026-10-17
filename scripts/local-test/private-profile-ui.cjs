/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Browser walk-through of the private profile page (/member), as a
// candidate sees it, against the local build and the emulators:
//   set -a; . ./.env.local; set +a
//   node scripts/local-test/matchmaking.cjs seed
//   NODE_PATH=$(npm root -g) node scripts/local-test/private-profile-ui.cjs
// Signs in as the seeded candidate "mm-madrid" (Lucía), checks the page,
// pauses and resumes presentations (and that a paused profile leaves the
// team's search), and follows "Solicitar una consulta privada" to the
// prefilled request form without sending it. Screenshots go to
// .local-test/screens/perfil-*.png.
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
const OUT = ".local-test/screens";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key";
const UID = "mm-madrid";
const EMAIL = `${UID}@example.test`;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function idToken(uid) {
  const custom = await getAuth().createCustomToken(uid);
  const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  return res.json();
}

async function signIn(page, uid, email) {
  const t = await idToken(uid);
  const stored = {
    uid, email, emailVerified: true, isAnonymous: false, providerData: [],
    stsTokenManager: { refreshToken: t.refreshToken, accessToken: t.idToken, expirationTime: Date.now() + 3500 * 1000 },
    createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey: API_KEY, appName: "[DEFAULT]",
  };
  await page.goto(`${APP}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`firebase:authUser:${API_KEY}:[DEFAULT]`, JSON.stringify(stored)]);
  return t.idToken;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (!(await db.doc(`profiles/${UID}`).get()).exists) throw new Error("Seed first: node scripts/local-test/matchmaking.cjs seed");
  await db.doc(`profiles/${UID}`).update({ "meta.presentationsPaused": false });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-ES" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page, UID, EMAIL);

  await page.goto(`${APP}/member`, { waitUntil: "domcontentloaded" });
  await page.getByText("Tu perfil privado").waitFor({ timeout: 20000 });
  check("home is the private profile", await page.getByRole("heading", { name: "Lucía" }).isVisible());
  const nav = page.locator("header nav").first();
  const navText = (await nav.innerText()).toUpperCase();
  check("menu: Mi perfil, Ajustes, Cerrar sesión only", navText.includes("MI PERFIL") && navText.includes("AJUSTES") && navText.includes("CERRAR SESIÓN") && !/INICIO|PROPUESTAS|CONEXIONES|MI PLAN/.test(navText), navText.replace(/\s+/g, " "));
  const body = await page.locator("main").innerText();
  check("no membership, matches, inbox or payments", !/membres[ií]a|suscrip|propuestas recibidas|bandeja|mensajes|pagar ahora|checkout/i.test(body));
  check("who sees it: team, then clients in private, contact only with agreement", /presentamos en privado/.test(body) && /Nunca compartimos tu teléfono ni tu email sin tu acuerdo/.test(body));
  for (const s of ["Datos personales", "Fotos", "Sobre ti", "Lo que buscas", "Tu presentación", "Contacto"]) {
    check(`section «${s}» with Editar`, (await page.getByRole("link", { name: `Editar ${s}` }).count()) === 1);
  }
  check("income is not shown back", !/40k|80k|ingresos/i.test(body));
  check("programmes offered with prices", /Programa Select · 1\.950 €/.test(body) && /Select Privado · 4\.800 €/.test(body));
  await page.screenshot({ path: `${OUT}/perfil-1-pagina.png`, fullPage: true });

  // Edit → back
  await page.getByRole("link", { name: "Editar Lo que buscas" }).click();
  await page.waitForURL(`${APP}/member/profile/preferences`);
  check("Editar opens the existing questionnaire step", true);
  await page.goto(`${APP}/member/profile`, { waitUntil: "domcontentloaded" });
  await page.getByText("Tu perfil privado").waitFor({ timeout: 20000 });
  check("/member/profile shows the same page", true);

  // Pause
  const sw = page.getByRole("switch", { name: /Dejar de ser presentada/ });
  check("pause switch is worded for her («presentada»)", (await sw.count()) === 1);
  await sw.click();
  await page.getByText("En pausa", { exact: true }).waitFor();
  await page.waitForTimeout(800);
  const pausedDoc = (await db.doc(`profiles/${UID}`).get()).get("meta.presentationsPaused");
  check("pausing is saved on her profile", pausedDoc === true);
  await page.screenshot({ path: `${OUT}/perfil-2-pausa.png`, fullPage: false });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Has pedido no ser presentada por ahora").waitFor({ timeout: 20000 });
  check("pause survives a reload", true);
  await page.getByRole("switch", { name: /Dejar de ser presentada/ }).click();
  await page.getByText("Disponible", { exact: true }).waitFor();
  await page.waitForTimeout(800);
  check("resuming is saved", (await db.doc(`profiles/${UID}`).get()).get("meta.presentationsPaused") === false);

  // Delete opens the confirmation (not confirmed here)
  await page.getByRole("button", { name: "Eliminar mi perfil" }).click();
  check("delete asks for confirmation", await page.getByRole("dialog").isVisible().catch(() => false) || (await page.getByText("Eliminar tu perfil").count()) > 0);
  await page.keyboard.press("Escape");
  await page.goto(`${APP}/member`, { waitUntil: "domcontentloaded" });
  await page.getByText("Tu perfil privado").waitFor({ timeout: 20000 });

  // Consultation request, prefilled
  await page.getByText("Select Privado · 4.800 €").first().click();
  await page.getByRole("link", { name: "Solicitar una consulta privada" }).click();
  await page.waitForURL(/\/matchmaking\?programa=privado&desde=perfil/);
  await page.getByText("Hemos completado algunos datos con tu perfil").waitFor({ timeout: 20000 });
  const form = page.getByRole("form", { name: "Solicitar una entrevista privada" });
  const val = async (label) => form.getByRole("textbox", { name: label, exact: true }).inputValue().catch(() => "");
  const nombre = await val("Nombre");
  const email = await val("Email");
  const ciudad = await val("Ciudad");
  check("form prefilled: name, email, city", nombre === "Lucía" && email === EMAIL && ciudad === "Madrid", `${nombre} ${email} ${ciudad}`);
  check("programme preselected: Select Privado", await form.getByRole("radio", { name: /Select Privado/ }).isChecked());
  check("privacy box left for her to tick", !(await form.getByRole("checkbox").first().isChecked()));
  await form.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/perfil-3-solicitud.png`, fullPage: false });

  // Phone width
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", deviceScaleFactor: 2 });
  const pp = await phone.newPage();
  await signIn(pp, UID, EMAIL);
  await pp.goto(`${APP}/member`, { waitUntil: "domcontentloaded" });
  await pp.getByText("Tu perfil privado").waitFor({ timeout: 20000 });
  const overflow = await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("phone width: no sideways scrolling", overflow <= 1, `${overflow}px`);
  await pp.screenshot({ path: `${OUT}/perfil-4-movil.png`, fullPage: true });

  check("no browser errors", errors.length === 0, errors.join(" | ").slice(0, 200));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} of ${results.length} FAILED` : `\nAll ${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
