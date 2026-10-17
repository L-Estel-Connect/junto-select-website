/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Leaving at any point, against the local build (emulators):
//   - an unfinished profile reaches Ajustes from the questionnaire header,
//     and can delete the account from there;
//   - "Guardar y salir" signs out;
//   - an account with nothing yet ("Tu cuenta") can delete itself;
//   - a Select member without a profile keeps the member menu in Ajustes;
//   - unknown addresses get the Junto Select 404.
//   set -a; . ./.env.local; set +a
//   NODE_PATH=$(npm root -g) node scripts/local-test/account-exit.cjs
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
const AUTH_EMU = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
const SHOTS = ".local-test/account-exit";
fs.mkdirSync(SHOTS, { recursive: true });
const RUN = Date.now();

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function signIn(page, email, entryUrl) {
  await page.goto(entryUrl);
  await page.click("text=Continuar con email");
  await page.fill("input[type=email]", email);
  await page.click("text=Enviar enlace");
  await page.waitForTimeout(800);
  await page.goto(await magicLinkTarget(email));
}

async function uidOf(email) {
  return (await getAuth().getUserByEmail(email)).uid;
}
async function authExists(uid) {
  return getAuth().getUser(uid).then(() => true, () => false);
}

/** Starts a passive profile and answers the first question, so it counts as begun. */
async function startProfile(page, email) {
  await signIn(page, email, `${APP}/introduction?modalidad=pasivo`);
  await page.waitForURL(/\/introduction\/onboarding/, { timeout: 30000 });
  await page.locator("input[type=text]").first().fill("Elena");
  await page.click("text=Continuar");
  await page.waitForTimeout(1500);
}

async function deleteViaModal(page) {
  await page.locator("[role=dialog] input[type=checkbox]").check();
  await page.locator("[role=dialog] button", { hasText: "Eliminar mi perfil" }).click();
  await page.waitForURL(/\/perfil-eliminado/, { timeout: 30000 });
}

async function main() {
  const browser = await chromium.launch();

  // 1. Unfinished profile: Ajustes from the questionnaire, then delete.
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    const email = `salida.ajustes.${RUN}@example.test`;
    await startProfile(page, email);
    const uid = await uidOf(email);
    check("unfinished: questionnaire header links to Ajustes", (await page.locator("header >> text=Ajustes").count()) === 1);
    await page.click("header >> text=Ajustes");
    await page.waitForURL(/\/member\/settings/, { timeout: 20000 });
    await page.locator("h1", { hasText: "Ajustes" }).waitFor({ timeout: 20000 });
    check("unfinished: Ajustes opens (not sent back to the questionnaire)", page.url().endsWith("/member/settings"));
    check("unfinished: Ajustes keeps the questionnaire header",
      await page.locator("header >> text=Guardar y salir").waitFor({ timeout: 10000 }).then(() => true, () => false));
    check("unfinished: Ajustes offers Continuar mi perfil", (await page.locator("text=Continuar mi perfil").count()) === 1);
    check("unfinished: no membership link without a membership", (await page.locator("text=Gestionar mi membresía").count()) === 0);
    check("unfinished: Cerrar sesión present", (await page.locator("text=Cerrar sesión").count()) === 1);
    await page.screenshot({ path: `${SHOTS}/1-ajustes-unfinished.png`, fullPage: true });
    await page.click("text=Continuar mi perfil");
    await page.waitForURL(/\/introduction\/onboarding|\/member\/profile/, { timeout: 20000 });
    check("unfinished: Continuar mi perfil returns to the questionnaire", true, page.url().replace(APP, ""));
    await page.goto(`${APP}/member/settings`);
    await page.click("text=Eliminar perfil");
    await deleteViaModal(page);
    await page.locator("h1", { hasText: "Tu perfil se ha eliminado" }).waitFor({ timeout: 20000 });
    check("unfinished: deletion lands on the confirmation (h1)", true);
    await sleep(1000);
    check("unfinished: profile deleted", !(await db.doc(`profiles/${uid}`).get()).exists);
    check("unfinished: login deleted", !(await authExists(uid)));
    await ctx.close();
  }

  // 2. "Guardar y salir" signs out.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const email = `salida.guardar.${RUN}@example.test`;
    await startProfile(page, email);
    const uid = await uidOf(email);
    await page.click("header >> text=Guardar y salir");
    await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 20000 });
    check("Guardar y salir: lands on the homepage", true);
    await page.goto(`${APP}/member/settings`);
    await page.waitForURL(/\/introduction/, { timeout: 20000 });
    await page.locator("text=Continuar con email").waitFor({ timeout: 20000 });
    check("Guardar y salir: signed out (member pages ask to sign in)", true, page.url().replace(APP, ""));
    const p = (await db.doc(`profiles/${uid}`).get()).data();
    check("Guardar y salir: answers kept", p?.visible?.firstName === "Elena", p?.visible?.firstName);
    await ctx.close();
  }

  // 3. "Tu cuenta" (nothing created yet): delete the account.
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    const email = `salida.cuenta.${RUN}@example.test`;
    await signIn(page, email, `${APP}/introduction`);
    await page.locator("text=Tu cuenta").first().waitFor({ timeout: 30000 });
    const uid = await uidOf(email);
    const h1 = (await page.locator("h1").first().innerText()).trim();
    check("Tu cuenta: greeting does not show the email as a name", h1 === "Hola.", h1);
    check("Tu cuenta: shows which account is signed in", (await page.locator(`text=Has accedido como ${email}`).count()) === 1);
    await page.screenshot({ path: `${SHOTS}/3-tu-cuenta.png`, fullPage: true });
    await page.click("text=Eliminar mi cuenta");
    await deleteViaModal(page);
    await sleep(1000);
    check("Tu cuenta: login deleted", !(await authExists(uid)));
    check("Tu cuenta: no profile was created", !(await db.doc(`profiles/${uid}`).get()).exists);
    await ctx.close();
  }

  // 4. Select member without a profile keeps the member menu in Ajustes.
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    const email = `salida.select.${RUN}@example.test`;
    const user = await getAuth().createUser({ email, emailVerified: true });
    await db.doc(`billing/${user.uid}`).set({
      status: "active", planKey: "monthly", stripeCustomerId: "cus_local", stripeSubscriptionId: `sub_local_${RUN}`,
      currentPeriodEnd: new Date(Date.now() + 20 * 864e5), subscriptionStartedAt: new Date(), cancelAtPeriodEnd: false,
      canceledAt: null, lastPaymentFailedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });
    await signIn(page, email, `${APP}/introduction`);
    await page.waitForURL(/\/member/, { timeout: 30000 });
    await page.goto(`${APP}/member/settings`);
    await page.locator("h1", { hasText: "Ajustes" }).waitFor({ timeout: 20000 });
    check("Select without profile: member menu shown", (await page.locator("header >> text=Mi plan").count()) >= 1);
    check("Select without profile: Gestionar mi membresía shown", (await page.locator("text=Gestionar mi membresía").count()) === 1);
    await ctx.close();
  }

  // 5. Junto Select 404.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const res = await page.goto(`${APP}/esta-direccion-no-existe`);
    check("404: status 404", res.status() === 404, String(res.status()));
    check("404: Spanish heading", (await page.locator("h1").first().innerText()).includes("Esta página no existe"));
    check("404: way back home", (await page.locator("main a.link", { hasText: "Volver al inicio" }).getAttribute("href")) === "/");
    check("404: site header and footer", (await page.locator("header.hdr").count()) === 1 && (await page.locator("footer").count()) >= 1);
    const html = await page.content();
    check("404: no default Next.js text", !html.includes("This page could not be found"));
    await page.screenshot({ path: `${SHOTS}/5-404-mobile.png`, fullPage: true });
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
