/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Private candidate registration: minimum age 18 (no maximum) and the
// presentation step when AI generation fails or succeeds.
//   set -a; . ./.env.local; set +a
//   NODE_PATH=$(npm root -g) node scripts/local-test/candidate-age-ui.cjs
// Needs: emulators (auth/firestore/storage), start.sh (app + mock services).
// Locally there is no Anthropic key, so generation fails for real and the
// manual fallback is what gets tested; one journey stubs a successful draft.
// The browser runs on Madrid time, like real users, so birth dates are
// stored at Madrid midnight and compared as Madrid dates.
//
// On STAGING (junto-select-staging only), with Application Default
// Credentials that can write to that project:
//   STAGING_URL=https://junto-select-website--junto-select-staging.europe-west4.hosted.app \
//     node scripts/local-test/candidate-age-ui.cjs
// Sign-in links are created with the Admin SDK (no email is sent). Staging
// answers generation with a simulated draft, so the failing journeys make
// the browser see the same 502 production returned. Its own edad-* test
// accounts are deleted at the end.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const STAGING = process.env.STAGING_URL || "";
if (STAGING && !STAGING.includes("junto-select-staging")) {
  console.error("Refusing: STAGING_URL must be the junto-select-staging site.");
  process.exit(1);
}
const project = STAGING ? "junto-select-staging" : process.env.GCLOUD_PROJECT || "";
if (!STAGING && (!process.env.FIRESTORE_EMULATOR_HOST || !project.startsWith("demo-"))) {
  console.error("Refusing to run outside the emulators.");
  process.exit(1);
}
initializeApp({ projectId: project });
const db = getFirestore();

const APP = STAGING ? STAGING.replace(/\/$/, "") : "http://localhost:3000";
const AUTH_EMU = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
const SHOTS = ".local-test/candidate-age-ui";
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
  const email = `edad.${tag}.${Date.now()}@${STAGING ? "junto-select-staging.test" : "example.test"}`;
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
async function finishProfile(page, uid, tag, ai) {
  await page.waitForURL("**/member/profile/preferences", { timeout: 20000 });
  await page.getByRole("heading", { name: "Lo que buscas" }).waitFor();
  const row = (q) => page.locator("div.border-b", { has: page.locator(`p:text-is("${q}")`) });
  const opt = (r, name, exact = false) => r.getByRole("radio", { name, exact }).or(r.getByRole("button", { name, exact }));
  await opt(row("¿A quién te gustaría conocer?"), "Hombres", true).click();
  const age = row("Rango de edad").locator("input[type=number]");
  await age.nth(0).fill(tag === "18" ? "18" : "30");
  await age.nth(1).fill("70");
  await opt(row("Distancia máxima"), "En mi misma ciudad").click();
  await opt(row("Qué tipo de relación debe buscar la otra persona"), "Una relación seria").click();
  await opt(row("¿Aceptarías a alguien que fuma?"), "No", true).click();
  await opt(row("¿Te importaría que tuviera hijos menores de 15 años?"), "No, no me importaría").click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.locator('div.border-b:has(p:text-is("Rango de altura (opcional)"))').waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.waitForURL("**/member/profile/photos", { timeout: 20000 });
  await page.locator("input[type=file]").first().waitFor({ state: "attached", timeout: 20000 });
  await page.locator("input[type=file]").first().setInputFiles(PHOTO);
  const photoCont = page.getByRole("button", { name: "Continuar" });
  await waitFor(async () => photoCont.isEnabled(), 30000);
  await photoCont.click();
  await page.waitForURL("**/member/profile/presentation", { timeout: 20000 });

  // Presentation
  await page.getByRole("heading", { name: "Tu presentación" }).waitFor();
  const answers = [
    "Pasear por el Retiro, leer novela negra y cocinar para amigos los domingos",
    "La confianza, el humor y poder hablar de todo con calma",
    "Que escucho de verdad y que siempre tengo un plan para el fin de semana",
  ];
  const tas = page.locator("textarea");
  // Typed without blurring the last one: Generar must save the answers itself.
  for (let i = 0; i < 3; i++) await tas.nth(i).fill(answers[i]);
  if (ai === "fails" && STAGING) {
    await page.route("**/api/introduction/generate-presentation", (r) =>
      r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, error: "generation_failed" }) }),
    );
  }
  if (ai === "stub") {
    await page.route("**/api/introduction/generate-presentation", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, text: "Texto generado de prueba." }) }),
    );
  }
  await page.getByRole("button", { name: "Generar mi presentación" }).click();
  await page.getByRole("button", { name: "Aprobar" }).waitFor({ timeout: 60000 });

  if (ai === "fails") {
    const notice = page.locator("p[role=status]");
    check(`${tag}: Spanish fallback message shown`, (await notice.count()) === 1 && /escribirla tú/.test(await notice.innerText()), await notice.innerText().catch(() => ""));
    check(`${tag}: no red error on fallback`, (await page.locator("p[role=alert]").count()) === 0);
    const box = page.getByRole("textbox", { name: "Tu presentación", exact: true });
    const prefilled = await box.inputValue();
    check(`${tag}: manual text box prefilled from the answers`, answers.every((a) => prefilled.includes(a)));
    const saved = await profileOf(uid);
    check(`${tag}: answers kept on the profile`, saved?.presentation?.prompts?.aboutYou === answers[2] && saved?.presentation?.prompts?.freeTime === answers[0]);
    check(`${tag}: answers still in the form`, (await page.locator("#prompt-values").inputValue()) === answers[1]);
    await page.screenshot({ path: `${SHOTS}/${tag}-presentation-fallback.png`, fullPage: true });
    await box.fill(`Me llamo Prueba ${tag}. ${prefilled}`);
  }
  await page.getByRole("button", { name: "Aprobar" }).click();
  await page.getByRole("button", { name: "Continuar" }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForURL(/\/member\/profile(\?.*)?$/, { timeout: 20000 });
  await page.getByText("Acepto participar en las introducciones privadas").click();
  await page.getByRole("button", { name: "Guardar y finalizar" }).click();
  await page.getByTestId("onboarding-complete").waitFor({ timeout: 20000 });
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ---- Eligible ages: full registration ----
    const ages = [
      { tag: "18", dob: birthDate(18), ai: "fails" }, // turns 18 today
      { tag: "25", dob: birthDate(25, -40), ai: "fails" },
      { tag: "30", dob: birthDate(30, -100), ai: "stub" },
      { tag: "40", dob: birthDate(40, -10), ai: "fails" },
      { tag: "60", dob: birthDate(60, -200), ai: "fails" },
    ];
    for (const a of ages) {
      const { ctx, page, uid } = await start(browser, a.tag);
      const out = await walkWizard(page, `Prueba${a.tag}`, a.dob);
      check(`${a.tag}: questionnaire accepted (born ${a.dob})`, out === "left", out);
      if (out !== "left") { await ctx.close(); continue; }
      await finishProfile(page, uid, a.tag, a.ai);
      const p = await profileOf(uid);
      check(`${a.tag}: profile finalized`, p?.meta?.onboardingFinalized === true);
      check(`${a.tag}: birth date stored`, p?.private?.birthDate?.toDate().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }) === a.dob);
      check(`${a.tag}: presentation approved`, p?.presentation?.status === "approved", p?.presentation?.approvedText?.slice(0, 40));
      if (a.ai === "fails") check(`${a.tag}: approved text is the manual one`, p?.presentation?.approvedText?.startsWith(`Me llamo Prueba ${a.tag}.`) && !p?.presentation?.generatedText);
      if (a.tag === "18") check("18: own age preference can start at 18", p?.dealbreakers?.ageMin === 18, String(p?.dealbreakers?.ageMin));
      if (a.tag === "40") {
        // Profile editing afterwards: change the presentation from Mi perfil.
        await page.goto(`${APP}/member/profile/presentation`);
        await page.getByRole("button", { name: "Editar el texto" }).click();
        await page.getByRole("textbox", { name: "Tu presentación", exact: true }).fill("Texto editado después del registro.");
        await page.getByRole("button", { name: "Guardar cambios" }).click();
        const edited = await waitFor(async () => (await profileOf(uid))?.presentation?.approvedText === "Texto editado después del registro.");
        check("40: presentation edited after registration", !!edited);
      }
      await ctx.close();
    }

    // ---- Under 18: rejected in the UI, nothing stored ----
    for (const u of [
      { tag: "17", dob: birthDate(17) },
      { tag: "17y364d", dob: birthDate(18, 1) }, // turns 18 tomorrow
    ]) {
      const { ctx, page, uid } = await start(browser, u.tag);
      const out = await walkWizard(page, `Menor${u.tag}`, u.dob);
      check(`${u.tag}: rejected with the 18+ message (born ${u.dob})`, out === "ineligible", out);
      await page.screenshot({ path: `${SHOTS}/${u.tag}-rejected.png`, fullPage: true });
      const p = await profileOf(uid);
      check(`${u.tag}: no birth date stored`, !p?.private?.birthDate);
      await ctx.close();
    }
  } catch (e) {
    check(`unexpected error: ${e.message.split("\n")[0]}`, false);
    console.error(e);
  }

  await browser.close();
  if (STAGING) {
    // Remove this run's own test accounts (and their profile documents).
    for (const email of created) {
      const user = await getAuth().getUserByEmail(email).catch(() => null);
      if (!user) continue;
      for (const col of ["profiles", "users", "introductionsConsent", "candidateLocations"]) await db.doc(`${col}/${user.uid}`).delete().catch(() => {});
      await getAuth().deleteUser(user.uid).catch(() => {});
    }
    console.log(`cleaned up ${created.length} staging test accounts`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
