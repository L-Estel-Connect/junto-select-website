/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Drives the five test journeys against the local build (emulators + mock
// Stripe/Brevo). Writes screenshots to .local-test/shots and prints PASS/FAIL.
//   NODE_PATH=$(npm root -g) node scripts/local-test/journeys.cjs
// Needs: emulators running, scripts/local-test/start.sh running, seed.mjs
// run and snapshotted.
const fs = require("node:fs");
const { chromium } = require("playwright");
const { initializeApp } = require("firebase-admin/app");
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
const SHOTS = ".local-test/shots";
const MOCK_LOG = ".local-test/mock-log.jsonl";
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const mockLog = () =>
  fs.existsSync(MOCK_LOG) ? fs.readFileSync(MOCK_LOG, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function magicLinkFor(email) {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${AUTH_EMU}/emulator/v1/projects/${project}/oobCodes`);
    const { oobCodes } = await res.json();
    const hit = oobCodes.filter((c) => c.email === email && c.requestType === "EMAIL_SIGNIN").pop();
    if (hit) return hit.oobLink;
    await sleep(500);
  }
  throw new Error(`no magic link for ${email}`);
}

async function signInByLink(page, email) {
  await page.fill("#alta-email", email);
  await page.click("text=Recibir enlace de acceso");
  await page.waitForSelector("text=Te hemos enviado un enlace");
  const link = await magicLinkFor(email);
  // The emulator's action URL redirects to continueUrl with the sign-in code.
  const u = new URL(link);
  const target = new URL(u.searchParams.get("continueUrl"));
  for (const [k, v] of u.searchParams) if (k !== "continueUrl") target.searchParams.set(k, v);
  await page.goto(target.toString());
  await page.waitForSelector("text=¿Vives en Madrid", { timeout: 20000 });
}

// 5b. An existing Introductions profile takes the new paid path: only the
// billing-driven fields may change; their answers, photos and status stay.
async function existingProfilePays(browser) {
  const FIELDS_ALLOWED = ["searchStatus", "matchingPausedAt", "matchingAnchorAt", "matchingSubscriptionId", "matchingPeriodsProcessed", "nextMatchingDueAt", "updatedAt"];
  for (const { uid, email, landing } of [
    { uid: "intro-draft", email: "prueba.borrador@example.test", landing: "/member/bienvenida" },
    { uid: "intro-finalized", email: "prueba.finalizado@example.test", landing: "/member" },
  ]) {
    const before = JSON.parse(JSON.stringify((await db.doc(`profiles/${uid}`).get()).data()));
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "es-ES" });
    const page = await ctx.newPage();
    await page.goto(`${APP}/membresia/alta?plan=monthly`);
    await signInByLink(page, email);
    await page.check("input[name=market][value=lives_in_market]", { force: true });
    const boxes = page.locator("label.check input[type=checkbox]");
    for (let i = 0; i < 3; i++) await boxes.nth(i).check({ force: true });
    await page.click("button[type=submit]");
    await page.waitForURL("**/pay/**", { timeout: 20000 });
    await page.click("#pay");
    await page.waitForURL((u) => u.pathname === landing, { timeout: 30000 });
    await page.waitForTimeout(1500);
    await shot(page, `5-existing-${uid}-after-payment`);
    const after = JSON.parse(JSON.stringify((await db.doc(`profiles/${uid}`).get()).data()));
    const changed = [];
    for (const section of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (section === "meta") {
        for (const k of new Set([...Object.keys(before.meta), ...Object.keys(after.meta)]))
          if (JSON.stringify(before.meta[k]) !== JSON.stringify(after.meta[k])) changed.push(`meta.${k}`);
      } else if (JSON.stringify(before[section]) !== JSON.stringify(after[section])) changed.push(section);
    }
    const unexpected = changed.filter((f) => !FIELDS_ALLOWED.includes(f.replace("meta.", "")));
    check(`5 ${uid}: pays, answers untouched`, unexpected.length === 0 && after.meta.searchStatus === "active_search", `changed: ${changed.join(", ")}`);
    check(`5 ${uid}: lands on ${landing}`, true);
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch();
  if (process.argv[2] === "existing") {
    await existingProfilePays(browser);
    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
  }
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "es-ES" });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", isMobile: true, hasTouch: true });

  // 1. Homepage and city registration
  {
    const page = await desktop.newPage();
    await page.goto(APP);
    await shot(page, "1-home-desktop");
    const body = await page.textContent("body");
    check("1 home shows 300+ / 700+ / 3.000+", ["300+", "700+", "3.000+"].every((s) => body.includes(s)));
    check("1 home has no '7 encuentros' or 'Gratis'", !/7 encuentros|gratis/i.test(body));
    await page.click("#ciudades a[href='/unete?ciudad=valencia']");
    await page.waitForURL("**/unete?ciudad=valencia");
    check("1 city click preselects Valencia", await page.isChecked("input[name=ciudad][value=valencia]"));
    await shot(page, "1-unete-valencia-desktop");
    const m = await mobile.newPage();
    await m.goto(APP);
    await shot(m, "1-home-mobile");
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check("1 home has no horizontal scroll on mobile", !overflow);
    await m.goto(`${APP}/unete?ciudad=otra`);
    check("1 'Otra ciudad' asks for the city name", await m.isVisible("text=¿Cuál?"));
    await shot(m, "1-unete-otra-mobile");
  }

  // 2. Community form and Brevo segmentation
  {
    const page = await desktop.newPage();
    const email = `comunidad.valencia.${Date.now()}@example.test`;
    await page.goto(`${APP}/unete?ciudad=valencia`);
    await page.fill("input[autocomplete=given-name], input[id$=-nombre]", "Prueba Valencia");
    await page.fill("input[type=email]", email);
    await page.check("input[name=genero][value=mujer]", { force: true });
    await page.check("input[name=rangoEdad][value='45-54']", { force: true });
    await page.check("input[value=eventos]", { force: true });
    await page.check("input[value=cenas]", { force: true });
    const checks = page.locator("label.check input[type=checkbox]");
    await checks.nth(0).check({ force: true });
    await checks.nth(1).check({ force: true });
    await page.click("button[type=submit]");
    await page.waitForSelector("text=al club, Prueba", { timeout: 15000 });
    await shot(page, "2-form-success-desktop");
    await sleep(800);
    const snap = await db.collection("invitationRequests").where("email", "==", email).get();
    const doc = snap.docs[0]?.data();
    check("2 registration stored", Boolean(doc), doc ? `city=${doc.ciudad} sync=${doc.brevoSyncStatus}` : "");
    check("2 Brevo sync marked synced", doc?.brevoSyncStatus === "synced");
    const sent = mockLog().filter((e) => e.kind === "contact_upsert" && e.data.email === email).pop();
    const a = sent?.data.attributes ?? {};
    check(
      "2 Brevo payload carries segmentation",
      a.CIUDAD === "Valencia" && a.GENERO === "Mujer" && a.RANGO_EDAD === "45-54" && a.INT_EVENTOS === true &&
        a.INT_CENAS === true && a.INT_INTRODUCCIONES === false && a.CONSENT_MARKETING === true && a.FUENTE === "web_ciudad_valencia",
      JSON.stringify(a),
    );
    check("2 Brevo goes to the test community list only", JSON.stringify(sent?.data.listIds) === "[999]");

    const email2 = `comunidad.sinconsent.${Date.now()}@example.test`;
    await page.goto(`${APP}/unete`);
    await page.fill("input[id$=-nombre]", "Prueba Madrid");
    await page.fill("input[type=email]", email2);
    await page.check("input[name=ciudad][value=madrid]", { force: true });
    await page.check("input[name=genero][value=hombre]", { force: true });
    await page.check("input[name=rangoEdad][value='55-64']", { force: true });
    await page.check("input[value=introducciones]", { force: true });
    await page.locator("label.check input[type=checkbox]").nth(0).check({ force: true });
    await page.click("button[type=submit]");
    await page.waitForSelector("text=al club, Prueba", { timeout: 15000 });
    await sleep(800);
    const d2 = (await db.collection("invitationRequests").where("email", "==", email2).get()).docs[0]?.data();
    check("2 without marketing consent: stored, not sent to Brevo",
      d2?.brevoSyncStatus === "skipped_no_consent" && !mockLog().some((e) => e.data?.email === email2));

    await page.goto(`${APP}/unete`);
    await page.click("button[type=submit]");
    check("2 empty form shows errors", (await page.locator(".err, [role=alert]").count()) > 0);
    await shot(page, "2-form-errors-desktop");
  }

  // 3. Membership page
  {
    const page = await desktop.newPage();
    await page.goto(`${APP}/membresia`);
    await shot(page, "3-membresia-desktop");
    const body = await page.textContent("body");
    check("3 plans 49 / 129 / 234 €", ["49", "129", "234"].every((p) => body.includes(`${p} €`)));
    check("3 headline 'Más que asistir, pertenecer'", body.includes("Más que asistir, pertenecer"));
    const m = await mobile.newPage();
    await m.goto(`${APP}/membresia`);
    await shot(m, "3-membresia-mobile");
    check("3 no horizontal scroll on mobile", !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  }

  // 4. Choose plan → account → payment → member area → profile
  {
    const page = await desktop.newPage();
    const email = `nuevo.miembro.${Date.now()}@example.test`;
    await page.goto(`${APP}/membresia`);
    await page.click("a[href='/membresia/alta?plan=three_month']");
    await page.waitForURL("**/membresia/alta?plan=three_month");
    await shot(page, "4a-alta-cuenta-desktop");
    await signInByLink(page, email);
    await shot(page, "4b-alta-activacion-desktop");

    // Someone not regularly in Madrid is stopped before any payment.
    await page.check("input[name=market][value=not_regular_in_market]", { force: true });
    check("4 not in Madrid: payment button disabled", await page.isDisabled("button[type=submit]"));

    await page.check("input[name=market][value=lives_in_market]", { force: true });
    const boxes = page.locator("label.check input[type=checkbox]");
    for (let i = 0; i < 3; i++) await boxes.nth(i).check({ force: true });
    await page.click("button[type=submit]");
    await page.waitForURL("**/pay/**", { timeout: 20000 });
    await shot(page, "4c-pago-simulado");
    await page.click("#pay");
    await page.waitForURL("**/member/bienvenida**", { timeout: 20000 });
    await page.waitForSelector("text=Tu membresía está activa", { timeout: 20000 });
    await shot(page, "4d-bienvenida-desktop");

    const billing = (await db.collection("billing").where("stripeCustomerId", ">=", "cus_test").get()).docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((b) => b.status === "active");
    const newMember = billing[billing.length - 1];
    check("4 billing active after payment", Boolean(newMember), newMember ? `plan=${newMember.planKey}` : "");
    const prof = (await db.doc(`profiles/${newMember.id}`).get()).data();
    check("4 draft profile created with Madrid answer",
      prof?.visible?.marketAvailability === "lives_in_market" && prof?.meta?.onboardingFinalized === false);
    check("4 webhook set search active", prof?.meta?.searchStatus === "active_search");
    const signup = (await db.doc(`membershipSignups/${newMember.id}`).get()).data();
    check("4 sign-up record kept", signup?.planKey === "three_month" && Boolean(signup?.ageConfirmedAt));

    await page.click("text=Completar mi perfil");
    await page.waitForURL("**/introduction/onboarding**", { timeout: 20000 });
    await page.waitForTimeout(2500);
    await shot(page, "4e-perfil-onboarding-desktop");
    check("4 member lands in the Introductions profile", page.url().includes("/introduction/onboarding"));

    await page.goto(`${APP}/member`);
    await page.waitForURL("**/member/bienvenida**", { timeout: 20000 });
    check("4 paid member with unfinished profile is sent to welcome, not lost", true);

    // Simulate finishing the profile (the onboarding screens themselves are unchanged).
    await db.doc(`profiles/${newMember.id}`).update({ "meta.onboardingFinalized": true });
    await page.goto(`${APP}/member/bienvenida`);
    await page.waitForURL((u) => u.pathname === "/member", { timeout: 20000 });
    await page.waitForTimeout(2000);
    await shot(page, "4f-member-home-desktop");
    check("4 after finishing the profile, member home opens", new URL(page.url()).pathname === "/member");
    fs.writeFileSync(".local-test/new-member-uid.txt", newMember.id);
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
