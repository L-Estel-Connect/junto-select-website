/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// PRODUCTION post-release check (select-dev-508407 only), run once after an
// approved release. Creates at most two temporary accounts named
// prueba-prod-edad.*@junto-prueba.invalid (sign-in links come from the Admin
// SDK, so no email is sent), and deletes them and their photos at the end.
// It never finalizes a profile, so nothing enters the candidate pool.
//   PROD_URL=https://juntoselect.com node scripts/local-test/prod-candidate-check.cjs
// Checks: an 18-year-old gets through the questionnaire; the manual fallback
// (browser sees a 502); one REAL AI presentation; under 18 refused; no other
// profile document changes during the run.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

const PROD = (process.env.PROD_URL || "").replace(/\/$/, "");
if (!/^https:\/\/(www\.)?juntoselect\.com$/.test(PROD)) {
  console.error("Refusing: PROD_URL must be https://juntoselect.com.");
  process.exit(1);
}
const project = "select-dev-508407";
initializeApp({ projectId: project, storageBucket: process.env.STORAGE_BUCKET || `${project}.firebasestorage.app` });
const db = getFirestore();
// signInOnIntroduction below takes the Admin SDK sign-in-link path when set.
const STAGING = PROD;
const APP = PROD;
const AUTH_EMU = "";
const SHOTS = ".local-test/prod-candidate-check";
fs.mkdirSync(SHOTS, { recursive: true });
const DESKTOP = { width: 1366, height: 900 };
const PHOTO = path.resolve("public/images/guest-portrait-candlelight.jpg");
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ISO birth date for someone who is exactly `years` old today, shifted by `days`. */
function birthDate(years, days = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---- Copied from onboarding-ui.cjs ----
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

async function signInOnIntroduction(page, email, entryUrl) {
  if (STAGING) {
    // Same link Firebase would email, made by the Admin SDK so nothing is sent.
    const link = await getAuth().generateSignInWithEmailLink(email, { url: entryUrl, handleCodeInApp: true });
    await page.goto(entryUrl);
    await page.evaluate((e) => localStorage.setItem("junto_email_for_signin", e), email);
    await page.goto(link);
    return;
  }
  await page.goto(entryUrl);
  await page.click("text=Continuar con email");
  await page.fill("input[type=email]", email);
  await page.click("text=Enviar enlace");
  await page.waitForTimeout(800);
  await page.goto(await magicLinkTarget(email));
}

const ANSWERS = {
  Soy: { option: "Mujer" },
  "¿En qué ciudad vives?": { text: "Madrid" },
  "¿A qué te dedicas?": { text: "Arquitecta" },
  "Tu formación": { option: "Universidad" },
  "Tu rango de ingresos anuales": { option: "40.000 – 80.000 €" },
  "Tu altura (cm)": { number: "168" },
  "¿Qué idiomas hablas?": { chips: ["Español", "Inglés"] },
  "¿Tienes hijos?": { option: "No tengo hijos" },
  "¿Qué tipo de relación buscas?": { option: "Una relación seria" },
  "¿Fumas?": { option: "No" },
  "¿Bebes alcohol?": { option: "Socialmente" },
  "Tu nivel de actividad física": { option: "Activo/a — varias veces por semana" },
  "¿Te gustaría tener hijos en el futuro?": { option: "No" },
  "¿Cuál es tu relación con Madrid?": { option: "Vivo en Madrid" },
};

async function answerStep(page, firstName, dob) {
  const h1 = page.locator("h1").first();
  await h1.waitFor({ timeout: 20000 });
  const q = (await h1.innerText()).trim();
  const a = ANSWERS[q] || {};
  const scope = h1.locator("xpath=..");
  if (await scope.locator("input[type=text]").count()) {
    await scope.locator("input[type=text]").fill(q === "¿Cómo te llamas?" ? firstName : a.text || "Prueba");
    await scope.getByRole("button", { name: "Continuar" }).click();
  } else if (await scope.locator("input[type=date]").count()) {
    await scope.locator("input[type=date]").fill(dob);
    await scope.getByRole("button", { name: "Continuar" }).click();
  } else if (await scope.locator("input[type=number]").count()) {
    await scope.locator("input[type=number]").fill(a.number || "170");
    await scope.getByRole("button", { name: "Continuar" }).click();
  } else if (a.chips) {
    for (const c of a.chips) await scope.getByRole("button", { name: c, exact: true }).click();
    await scope.getByRole("button", { name: "Continuar" }).click();
  } else if (a.option) {
    await scope.getByRole("button", { name: a.option, exact: true }).click();
  } else {
    await scope.locator("div.mt-8 button").first().click();
    const cont = scope.getByRole("button", { name: "Continuar" });
    if (await cont.count()) await cont.click();
  }
  return q;
}

async function waitStepChange(page, prev) {
  for (let i = 0; i < 60; i++) {
    if (!page.url().includes("/introduction/onboarding")) return;
    const h = await page.locator("h1").first().innerText().catch(() => "");
    if (h && h.trim() !== prev) return;
    await sleep(250);
  }
  throw new Error(`wizard stuck on "${prev}"`);
}

async function waitFor(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(400);
  }
  return v;
}
// ------------------------------------

const created = [];
const profileOf = async (uid) => (await db.doc(`profiles/${uid}`).get()).data();

/** Opens the free private-network entry and signs in. Returns { ctx, page, uid }. */
async function start(browser, tag) {
  const email = `prueba-prod-edad.${tag}.${Date.now()}@junto-prueba.invalid`;
  created.push(email);
  const ctx = await browser.newContext({ viewport: DESKTOP, locale: "es-ES", timezoneId: "Europe/Madrid" });
  const page = await ctx.newPage();
  await page.goto(`${APP}/matchmaking`, { waitUntil: "networkidle" });
  await page.locator(".mm-card.free").getByRole("link", { name: "Crear mi perfil privado" }).click();
  await page.waitForURL("**/introduction**", { timeout: 15000 });
  await signInOnIntroduction(page, email, page.url());
  await page.waitForURL("**/introduction/onboarding**", { timeout: 25000 });
  const uid = (await getAuth().getUserByEmail(email)).uid;
  return { ctx, page, uid };
}

/** Answers the questionnaire until it leaves the wizard or shows the age screen. */
async function walkWizard(page, firstName, dob) {
  for (let i = 0; i < 30; i++) {
    if (!page.url().includes("/introduction/onboarding")) return "left";
    if (await page.getByText("Para crear tu perfil necesitas tener al menos 18 años.").count()) return "ineligible";
    await page.locator("h1").first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(200);
    if (!page.url().includes("/introduction/onboarding")) return "left";
    const q = await answerStep(page, firstName, dob);
    if (q === "¿Cuál es tu fecha de nacimiento?") {
      const r = await waitFor(async () => {
        if (await page.getByText("Para crear tu perfil necesitas tener al menos 18 años.").count()) return "ineligible";
        const h = await page.locator("h1").first().innerText().catch(() => "");
        return h.trim() !== q ? "next" : null;
      });
      if (r === "ineligible") return "ineligible";
    } else {
      await waitStepChange(page, q);
    }
  }
  return "stuck";
}

/** Preferences + photo, then the presentation step. `ai`: "fails" (real) or "stub". */
async function profileTimes() {
  const snap = await db.collection("profiles").get();
  return new Map(snap.docs.map((d) => [d.id, d.updateTime.toMillis()]));
}

async function cleanup() {
  for (const email of created) {
    const user = await getAuth().getUserByEmail(email).catch(() => null);
    if (!user) continue;
    if (!email.startsWith("prueba-prod-edad.") || !email.endsWith("@junto-prueba.invalid")) continue;
    await getStorage().bucket().deleteFiles({ prefix: `profiles/${user.uid}/photos/` }).catch((e) => console.log(`NOTE photo cleanup: ${e.message}`));
    for (const col of ["profiles", "users", "introductionsConsent", "candidateLocations"]) await db.doc(`${col}/${user.uid}`).delete().catch(() => {});
    await getAuth().deleteUser(user.uid).catch(() => {});
    console.log(`deleted temporary account ${email}`);
  }
}

(async () => {
  const before = await profileTimes();
  const browser = await chromium.launch();
  const testUids = [];
  try {
    // ---- 18 today: questionnaire, fallback, then one real AI presentation ----
    const dob = birthDate(18);
    const { ctx, page, uid } = await start(browser, "18");
    testUids.push(uid);
    const out = await walkWizard(page, "Prueba", dob);
    check(`18: questionnaire accepted (born ${dob})`, out === "left", out);
    if (out === "left") {
      await page.waitForURL("**/member/profile/preferences", { timeout: 20000 });
      await page.getByRole("heading", { name: "Lo que buscas" }).waitFor();
      const row = (q) => page.locator("div.border-b", { has: page.locator(`p:text-is("${q}")`) });
      const opt = (r, name, exact = false) => r.getByRole("radio", { name, exact }).or(r.getByRole("button", { name, exact }));
      await opt(row("¿A quién te gustaría conocer?"), "Hombres", true).click();
      const age = row("Rango de edad").locator("input[type=number]");
      await age.nth(0).fill("18");
      await age.nth(1).fill("30");
      await opt(row("Distancia máxima"), "En mi misma ciudad").click();
      await opt(row("Qué tipo de relación debe buscar la otra persona"), "Una relación seria").click();
      await opt(row("¿Aceptarías a alguien que fuma?"), "No", true).click();
      await opt(row("¿Te importaría que tuviera hijos menores de 15 años?"), "No, no me importaría").click();
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: "Continuar", exact: true }).click();
      await row("Rango de altura (opcional)").waitFor({ timeout: 10000 });
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: "Continuar", exact: true }).click();
      await page.waitForURL("**/member/profile/photos", { timeout: 20000 });
      await page.locator("input[type=file]").first().waitFor({ state: "attached", timeout: 20000 });
      await page.locator("input[type=file]").first().setInputFiles(PHOTO);
      const photoCont = page.getByRole("button", { name: "Continuar" });
      await waitFor(async () => photoCont.isEnabled(), 30000);
      await photoCont.click();
      await page.waitForURL("**/member/profile/presentation", { timeout: 20000 });
      await page.getByRole("heading", { name: "Tu presentación" }).waitFor();
      const answers = [
        "Pasear por el Retiro, leer novela negra y cocinar para amigos los domingos",
        "La confianza, el humor y poder hablar de todo con calma",
        "Que escucho de verdad y que siempre tengo un plan para el fin de semana",
      ];
      const tas = page.locator("textarea");
      for (let i = 0; i < 3; i++) await tas.nth(i).fill(answers[i]);

      // Fallback: the browser sees the same 502 production returned before.
      await page.route("**/api/introduction/generate-presentation", (r) =>
        r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, error: "generation_failed" }) }),
      );
      await page.getByRole("button", { name: "Generar mi presentación" }).click();
      await page.getByRole("button", { name: "Aprobar" }).waitFor({ timeout: 30000 });
      const notice = page.locator("p[role=status]");
      check("fallback: Spanish message shown", /escribirla tú/.test(await notice.innerText().catch(() => "")));
      const box = page.getByRole("textbox", { name: "Tu presentación", exact: true });
      const prefilled = await box.inputValue();
      check("fallback: manual text prefilled from the answers", answers.every((a) => prefilled.includes(a)));
      check("fallback: answers kept on the profile", (await profileOf(uid))?.presentation?.prompts?.values === answers[1]);
      await page.screenshot({ path: `${SHOTS}/fallback.png`, fullPage: true });

      // Real AI: same page, real endpoint.
      await page.unroute("**/api/introduction/generate-presentation");
      const resp = page.waitForResponse((r) => r.url().includes("/api/introduction/generate-presentation"), { timeout: 90000 });
      await page.getByRole("button", { name: /Intentar generarla de nuevo/ }).click();
      const r = await resp;
      const generated = await waitFor(async () => (await profileOf(uid))?.presentation?.generatedText, 20000);
      check("real AI: endpoint returned 200", r.status() === 200, String(r.status()));
      check("real AI: draft saved on the profile", typeof generated === "string" && generated.length > 40 && !generated.startsWith("[Borrador"), generated ? `${generated.length} chars` : "none");
      await page.screenshot({ path: `${SHOTS}/real-ai.png`, fullPage: true });
      const p = await profileOf(uid);
      check("18: birth date stored", p?.private?.birthDate?.toDate().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }) === dob);
    }
    await ctx.close();

    // ---- 17: refused, nothing stored ----
    {
      const u = await start(browser, "17");
      testUids.push(u.uid);
      const res = await walkWizard(u.page, "Menor", birthDate(17));
      check("17: refused with the 18+ message", res === "ineligible", res);
      check("17: no birth date stored", !(await profileOf(u.uid))?.private?.birthDate);
      await u.ctx.close();
    }
  } catch (e) {
    check(`unexpected error: ${e.message.split("\n")[0]}`, false);
    console.error(e);
  }
  await browser.close();
  await cleanup();

  // Other profiles: none created, changed or removed by this run (a real
  // user editing their own profile at the same moment would show here too).
  const after = await profileTimes();
  for (const id of testUids) { before.delete(id); after.delete(id); }
  const changed = [...before].filter(([id, t]) => after.get(id) !== t).map(([id]) => id);
  const added = [...after.keys()].filter((id) => !before.has(id));
  check(`existing profiles unchanged (${before.size})`, changed.length === 0 && added.length === 0, `${changed.length} changed, ${added.length} new`);
  const leftovers = await Promise.all(created.map((e) => getAuth().getUserByEmail(e).then(() => e).catch(() => null)));
  check("temporary accounts deleted", leftovers.every((x) => !x));

  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
