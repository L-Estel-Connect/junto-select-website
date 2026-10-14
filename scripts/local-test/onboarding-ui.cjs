/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Introducciones onboarding through the REAL screens, as brand-new users,
// for both journeys (passive and active/Select with mock payment).
//   set -a; . ./.env.local; set +a
//   NODE_PATH=$(npm root -g) node scripts/local-test/onboarding-ui.cjs
// Needs: emulators (auth/firestore/storage), start.sh (app + mock services).
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
const AUTH_EMU = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
const SHOTS = ".local-test/onboarding-ui";
fs.mkdirSync(SHOTS, { recursive: true });
const DESKTOP = { width: 1366, height: 900 };
const MOBILE = { width: 390, height: 844 };
const PHOTO = path.resolve("public/images/guest-portrait-candlelight.jpg");

const results = [];
const notes = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
function note(msg) {
  notes.push(msg);
  console.log(`NOTE  ${msg}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Copied from site-audit.cjs ----
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

/** Signs in on /introduction (the existing Introductions sign-in) by email link. */
async function signInOnIntroduction(page, email, entryUrl) {
  await page.goto(entryUrl);
  await page.click("text=Continuar con email");
  await page.fill("input[type=email]", email);
  await page.click("text=Enviar enlace");
  await page.waitForTimeout(800);
  await page.goto(await magicLinkTarget(email));
}
// ------------------------------------

// Answers chosen per question (h1 text). Anything not listed falls back to
// the first option. Birth date ~1975, Madrid resident.
const ANSWERS = {
  "¿Cómo te llamas?": { text: "Lucía" },
  Soy: { option: "Mujer" },
  "¿Cuál es tu fecha de nacimiento?": { date: "1975-04-18" },
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

/** Answers one wizard step through the UI. Returns the question text. */
async function answerStep(page, firstName) {
  const h1 = page.locator("h1").first();
  await h1.waitFor({ timeout: 20000 });
  const q = (await h1.innerText()).trim();
  const a = ANSWERS[q] || {};
  const scope = h1.locator("xpath=..");
  if (await scope.locator("input[type=text]").count()) {
    const value = q === "¿Cómo te llamas?" ? firstName : a.text || "Prueba";
    await scope.locator("input[type=text]").fill(value);
    await scope.getByRole("button", { name: "Continuar" }).click();
  } else if (await scope.locator("input[type=date]").count()) {
    await scope.locator("input[type=date]").fill(a.date || "1975-04-18");
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
    // Unknown step: pick the first option (chips need Continuar too).
    const buttons = scope.locator("div.mt-8 button");
    await buttons.first().click();
    const cont = scope.getByRole("button", { name: "Continuar" });
    if (await cont.count()) await cont.click();
    note(`unmapped wizard question answered with first option: "${q}"`);
  }
  return q;
}

/** Waits until the h1 is no longer `prev` (next step rendered) or URL left the wizard. */
async function waitStepChange(page, prev) {
  for (let i = 0; i < 60; i++) {
    if (!page.url().includes("/introduction/onboarding")) return;
    const h = await page.locator("h1").first().innerText().catch(() => "");
    if (h && h.trim() !== prev) return;
    await sleep(250);
  }
  throw new Error(`wizard stuck on "${prev}"`);
}

async function profileOf(uid) {
  return (await db.doc(`profiles/${uid}`).get()).data();
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

async function shot(page, name) {
  const p = `${SHOTS}/${name}.png`;
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

/** Runs the journey from /introducciones to /member/profile (pre-finalize). */
async function completeProfile(browser, kind) {
  const tag = kind;
  const cta = kind === "pasivo" ? "Crear mi perfil privado" : "Empezar la búsqueda activa";
  const email = `onb.${kind}.${Date.now()}@example.test`;
  const firstName = kind === "pasivo" ? "Lucía" : "Carmen";
  const ctx = await browser.newContext({ viewport: DESKTOP, locale: "es-ES" });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  // Landing + CTA
  await page.goto(`${APP}/introducciones`, { waitUntil: "networkidle" });
  await shot(page, `${tag}-00-introducciones`);
  await page.getByRole("link", { name: cta }).first().click();
  await page.waitForURL("**/introduction**", { timeout: 15000 });
  const entryUrl = page.url();
  check(`${tag}: CTA "${cta}" leads to /introduction`, /\/introduction\?modalidad=/.test(entryUrl), entryUrl);
  await shot(page, `${tag}-01-introduction-signin`);

  // Sign in
  await signInOnIntroduction(page, email, entryUrl);
  await page.waitForURL("**/introduction/onboarding**", { timeout: 25000 });
  check(`${tag}: signed in lands on /introduction/onboarding`, true);
  const uid = (await getAuth().getUserByEmail(email)).uid;

  // Questionnaire
  const asked = [];
  for (let i = 0; i < 30; i++) {
    if (!page.url().includes("/introduction/onboarding")) break;
    const h1 = page.locator("h1").first();
    await h1.waitFor({ timeout: 20000 });
    await page.waitForTimeout(200);
    if (!page.url().includes("/introduction/onboarding")) break;
    const pct = await page.locator("[role=progressbar]").getAttribute("aria-valuenow").catch(() => null);
    if (i === 0) await shot(page, `${tag}-02-wizard-step1`);
    const q = await answerStep(page, firstName);
    asked.push(q);
    if (i === 2) await shot(page, `${tag}-02-wizard-step3-${pct}`);
    const err = page.locator("p[role=alert]");
    await waitStepChange(page, q);
    if (await err.count()) note(`${tag}: wizard error after "${q}": ${await err.innerText()}`);
  }
  check(`${tag}: answered every wizard step through the UI`, asked.length === 16, `${asked.length} steps`);
  await page.waitForURL("**/member/profile/preferences", { timeout: 20000 });
  check(`${tag}: wizard hands over to /member/profile/preferences`, true);

  // Preferences
  await page.getByRole("heading", { name: "Lo que buscas" }).waitFor();
  const row = (q) => page.locator("div.border-b", { has: page.locator(`p:text-is("${q}")`) });
  // Single-choice preferences are radios (segmented control); multi-choice are toggle buttons.
  const opt = (r, name, exact = false) => r.getByRole("radio", { name, exact }).or(r.getByRole("button", { name, exact }));
  check(`${tag}: preferences shows the five-stage stepper`, await page.getByTestId("onboarding-stepper").isVisible());
  // Part 1 of 2: "Imprescindible para ti"
  await opt(row("¿A quién te gustaría conocer?"), "Hombres", true).click();
  const age = row("Rango de edad").locator("input[type=number]");
  await age.nth(0).fill("45");
  await age.nth(1).fill("60");
  await opt(row("Distancia máxima"), "En mi misma ciudad").click();
  await opt(row("Qué tipo de relación debe buscar la otra persona"), "Una relación seria").click();
  await opt(row("¿Aceptarías a alguien que fuma?"), "No", true).click();
  await opt(row("¿Te importaría que tuviera hijos menores de 15 años?"), "No, no me importaría").click();
  check(`${tag}: preferences part 1 hides the optional group`, (await row("Rango de altura (opcional)").count()) === 0);
  await page.waitForTimeout(800);
  await shot(page, `${tag}-03-preferences`);
  const prefCont1 = page.getByRole("button", { name: "Continuar", exact: true });
  check(`${tag}: preferences part 1 Continuar enabled`, await prefCont1.isEnabled());
  await prefCont1.click();
  // Part 2 of 2: "Preferencias"
  await row("Rango de altura (opcional)").waitFor({ timeout: 10000 });
  const h = row("Rango de altura (opcional)").locator("input[type=number]");
  await h.nth(0).fill("170");
  await h.nth(1).fill("195");
  await opt(row("¿Te importa que beba alcohol?"), "Socialmente").click();
  await opt(row("Nivel de actividad física que prefieres"), "Activo/a", true).click();
  await page.waitForTimeout(800);
  await shot(page, `${tag}-03b-preferences-part2`);
  const prefCont = page.getByRole("button", { name: "Continuar", exact: true });
  check(`${tag}: preferences Continuar enabled`, await prefCont.isEnabled());
  await prefCont.click();
  await page.waitForURL("**/member/profile/photos", { timeout: 20000 });
  check(`${tag}: preferences -> /member/profile/photos`, true);

  // Photos
  await page.locator("input[type=file]").first().waitFor({ state: "attached", timeout: 20000 });
  await shot(page, `${tag}-04-photos-empty`);
  await page.locator("input[type=file]").first().setInputFiles(PHOTO);
  const photoCont = page.getByRole("button", { name: "Continuar" });
  const enabled = await waitFor(async () => photoCont.isEnabled(), 30000);
  await page.waitForTimeout(1500); // let the thumbnail render
  await shot(page, `${tag}-04-photos-uploaded`);
  const photoErr = await page.locator("p[role=alert], p.text-\\[12px\\].text-\\[\\#8a3b3b\\]").allInnerTexts();
  check(`${tag}: photo uploaded via file input`, !!enabled, photoErr.join(" | "));
  await photoCont.click();
  await page.waitForURL("**/member/profile/presentation", { timeout: 20000 });
  check(`${tag}: photos -> /member/profile/presentation`, true);

  // Presentation
  await page.getByRole("heading", { name: "Tu presentación" }).waitFor();
  const tas = page.locator("textarea");
  const answers = [
    "Pasear por el Retiro, leer novela negra y cocinar para amigos los domingos.",
    "La confianza, el humor y poder hablar de todo con calma.",
    "Que escucho de verdad y que siempre tengo un plan para el fin de semana.",
  ];
  for (let i = 0; i < 3; i++) {
    await tas.nth(i).fill(answers[i]);
    await tas.nth(i).blur();
  }
  await page.waitForTimeout(500);
  await shot(page, `${tag}-05-presentation-prompts`);
  await page.getByRole("button", { name: "Generar mi presentación" }).click();
  const outcome = await waitFor(async () => {
    if (await page.getByRole("button", { name: "Aprobar" }).count()) return "draft";
    if (await page.locator("p[role=alert]").count()) return "error";
    return null;
  }, 60000);
  if (outcome !== "draft") {
    const msg = outcome === "error" ? await page.locator("p[role=alert]").innerText() : "timeout";
    await shot(page, `${tag}-05-presentation-generate-failed`);
    note(`${tag}: AI generation failed ("${msg}") and the page offers no manual path; stubbing /api/introduction/generate-presentation in the browser for this test`);
    await page.route("**/api/introduction/generate-presentation", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          text: `${firstName} es arquitecta en Madrid. Disfruta paseando por el Retiro, la novela negra y cocinando para sus amigos. Valora la confianza y el humor.`,
        }),
      }),
    );
    await page.getByRole("button", { name: /Generar/ }).click();
    await page.getByRole("button", { name: "Aprobar" }).waitFor({ timeout: 20000 });
  }
  check(`${tag}: presentation draft shown for review`, true, outcome === "draft" ? "real AI" : "stubbed AI");
  await shot(page, `${tag}-05-presentation-draft`);
  await page.getByRole("button", { name: "Aprobar" }).click();
  await page.getByRole("button", { name: "Continuar" }).waitFor({ timeout: 20000 });
  await shot(page, `${tag}-05-presentation-approved`);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForURL(/\/member\/profile(\?.*)?$/, { timeout: 20000 });
  check(`${tag}: presentation -> /member/profile`, true);
  await page.getByText("Acepto participar en las introducciones privadas").waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);
  await shot(page, `${tag}-06-profile-review`);
  if (consoleErrors.length) note(`${tag}: page errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
  return { ctx, page, uid, email };
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ---- 0. Mobile pass of the first 3 questionnaire steps ----
    {
      const ctx = await browser.newContext({ viewport: MOBILE, locale: "es-ES", isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      const email = `onb.mobile.${Date.now()}@example.test`;
      await page.goto(`${APP}/introducciones`, { waitUntil: "networkidle" });
      // Phones show one modalidad card at a time: Búsqueda activa first, a switch for the other.
      check("mobile: passive card hidden until chosen", !(await page.getByRole("link", { name: "Crear mi perfil privado" }).isVisible()));
      await page.locator("label[for=mod-passive]").click();
      check("mobile: switch shows the passive card", await page.getByRole("link", { name: "Crear mi perfil privado" }).isVisible());
      check("mobile: switch hides the active card", !(await page.getByRole("link", { name: "Empezar la búsqueda activa" }).isVisible()));
      await shot(page, "mobile-introducciones-switch-passive");
      await page.getByRole("link", { name: "Crear mi perfil privado" }).first().click();
      await page.waitForURL("**/introduction**");
      await signInOnIntroduction(page, email, page.url());
      await page.waitForURL("**/introduction/onboarding**", { timeout: 25000 });
      for (let i = 0; i < 3; i++) {
        await page.locator("h1").first().waitFor();
        await page.waitForTimeout(200);
        await shot(page, `mobile-wizard-step${i + 1}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`mobile: wizard step ${i + 1} has no horizontal scroll`, overflow <= 0, `${overflow}px`);
        const q = await answerStep(page, "Móvil");
        await waitStepChange(page, q);
      }
      await shot(page, "mobile-wizard-step4");
      await ctx.close();
    }

    // ---- 1. Passive journey ----
    {
      const { ctx, page, uid } = await completeProfile(browser, "pasivo");
      check("pasivo: no plan step on the review page", (await page.getByText("Elige tu plan").count()) === 0);
      await page.getByText("Acepto participar en las introducciones privadas").click();
      await page.getByRole("button", { name: "Guardar y finalizar" }).click();
      const p = await waitFor(async () => {
        const d = await profileOf(uid);
        return d?.meta?.onboardingFinalized ? d : null;
      });
      await page.getByTestId("onboarding-complete").waitFor({ timeout: 20000 });
      check("pasivo: completion screen shown", await page.getByText("Tu perfil ya forma parte de la red privada.").isVisible());
      await page.waitForTimeout(500);
      await shot(page, "pasivo-07-finalized");
      await page.getByRole("link", { name: "Ir a mi espacio" }).click();
      await page.waitForURL(/\/member$/, { timeout: 20000 });
      await page.getByText("Modalidad").waitFor({ timeout: 20000 });
      await page.getByText("Perfil privado", { exact: true }).waitFor({ timeout: 20000 });
      check("pasivo: member home shows 'Modalidad · Perfil privado'", true);
      await shot(page, "pasivo-08-member-home");
      check("pasivo: meta.onboardingFinalized true", p?.meta?.onboardingFinalized === true);
      check("pasivo: meta.requestedService passive", p?.meta?.requestedService === "passive", p?.meta?.requestedService);
      check("pasivo: meta.searchStatus passive", p?.meta?.searchStatus === "passive", p?.meta?.searchStatus);
      check("pasivo: photos non-empty", Array.isArray(p?.photos) && p.photos.length > 0, JSON.stringify(p?.photos));
      check("pasivo: about-me answers stored", p?.visible?.firstName === "Lucía" && p?.visible?.marketAvailability === "lives_in_market" && p?.private?.birthDate?.toDate().getUTCFullYear() === 1975);
      check("pasivo: presentation approved", p?.presentation?.status === "approved");
      check("pasivo: introductionsConsent exists", (await db.doc(`introductionsConsent/${uid}`).get()).exists);
      check("pasivo: no billing record", !(await db.doc(`billing/${uid}`).get()).exists);
      await ctx.close();
    }

    // ---- 2. Active journey ----
    {
      const { ctx, page, uid } = await completeProfile(browser, "activa");
      check("activa: 'Elige tu plan' shown", await page.getByText("Elige tu plan").isVisible());
      check("activa: no 'Guardar y finalizar' before payment", (await page.getByRole("button", { name: "Guardar y finalizar" }).count()) === 0);
      const before = await profileOf(uid);
      check("activa: onboardingFinalized false before payment", before?.meta?.onboardingFinalized === false, String(before?.meta?.onboardingFinalized));
      check("activa: requestedService select before payment", before?.meta?.requestedService === "select", before?.meta?.requestedService);
      await page.getByText("Acepto participar en las introducciones privadas").click();
      await page.locator("label:has-text('He leído y acepto los') input[type=checkbox]").check();
      await page.locator("label:has-text('Solicito que mi membresía') input[type=checkbox]").check();
      await page.getByRole("button", { name: /3 meses/ }).click();
      const payBtn = page.getByRole("button", { name: /Continuar al pago/ });
      await shot(page, "activa-07-plan-ready");
      check("activa: Continuar al pago enabled", await payBtn.isEnabled(), await payBtn.innerText());
      await payBtn.click();
      await page.waitForURL("**/pay/**", { timeout: 20000 });
      check("activa: redirected to the mock payment page", true, page.url().replace(/\?.*/, ""));
      await shot(page, "activa-08-mock-pay");
      await page.click("#pay");
      await page.waitForURL("**/member/profile?checkout=success**", { timeout: 25000 });
      check("activa: returns to /member/profile?checkout=success", true);
      await page.waitForTimeout(1000);
      await shot(page, "activa-09-return");
      const p = await waitFor(async () => {
        const d = await profileOf(uid);
        return d?.meta?.onboardingFinalized ? d : null;
      }, 25000);
      await page.getByTestId("onboarding-complete").waitFor({ timeout: 20000 });
      check("activa: completion screen shown", await page.getByText(/búsqueda activa ha comenzado/).isVisible());
      await page.waitForTimeout(500);
      await shot(page, "activa-10-finalized");
      const billing = (await db.doc(`billing/${uid}`).get()).data();
      check("activa: meta.onboardingFinalized true", p?.meta?.onboardingFinalized === true);
      check("activa: meta.requestedService select", p?.meta?.requestedService === "select", p?.meta?.requestedService);
      check("activa: meta.searchStatus active_search", p?.meta?.searchStatus === "active_search", p?.meta?.searchStatus);
      check("activa: billing status active", billing?.status === "active", billing?.status);
      check("activa: billing plan three_month", billing?.planKey === "three_month", billing?.planKey);
      check("activa: photos non-empty", Array.isArray(p?.photos) && p.photos.length > 0);
      check("activa: introductionsConsent exists", (await db.doc(`introductionsConsent/${uid}`).get()).exists);
      await ctx.close();
    }
  } catch (e) {
    check(`unexpected error: ${e.message.split("\n")[0]}`, false);
    console.error(e);
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (notes.length) console.log("Notes:\n" + notes.map((n) => " - " + n).join("\n"));
  if (failed.length) console.log("Failed:\n" + failed.map((f) => " - " + f.name).join("\n"));
  process.exit(failed.length ? 1 : 0);
})();
