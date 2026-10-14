/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Public website audit for v5 (navigation, links, typography, copy, CTAs,
// free Introductions journey, member sign-in return, collaboration form).
//   NODE_PATH=$(npm root -g) node scripts/local-test/site-audit.cjs
// Needs the same setup as journeys.cjs: emulators + start.sh running.
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
const SHOTS = ".local-test/shots-v5";
fs.mkdirSync(SHOTS, { recursive: true });

const PAGES = ["/", "/club", "/eventos", "/introducciones", "/membresia", "/unete", "/colaboraciones", "/membresia/alta?plan=three_month"];
const VIEWPORTS = { desktop: { width: 1366, height: 900 }, mobile: { width: 390, height: 844 } };

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (p) => (p === "/" ? "inicio" : p.replace(/^\//, "").replace(/[/?=&]/g, "-"));

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

const statusCache = new Map();
async function statusOf(path) {
  if (!statusCache.has(path)) {
    const res = await fetch(`${APP}${path}`, { redirect: "manual" });
    statusCache.set(path, res.status);
  }
  return statusCache.get(path);
}

(async () => {
  const browser = await chromium.launch();

  // ---- 1. Every public page, both viewports ----
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport, locale: "es-ES" });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      await page.goto(`${APP}${path}`, { waitUntil: "networkidle" });
      const tag = `${vpName} ${path}`;
      await page.screenshot({ path: `${SHOTS}/${vpName}-${slug(path)}.png`, fullPage: true });

      const info = await page.evaluate(() => {
        const links = [...document.querySelectorAll("a")].map((a) => ({
          href: a.getAttribute("href"),
          text: a.textContent.trim().replace(/\s+/g, " "),
          inFooter: !!a.closest("footer"),
        }));
        const h1 = document.querySelector("h1");
        const h1Style = h1 ? getComputedStyle(h1) : null;
        const bodyStyle = getComputedStyle(document.querySelector(".salon") || document.body);
        return {
          links,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          h1Font: h1Style?.fontFamily || "",
          h1Weight: h1Style?.fontWeight || "",
          bodyFont: bodyStyle.fontFamily,
          text: document.body.innerText,
          headerNav: [...document.querySelectorAll("header .nav a")].map((a) => a.textContent.trim()),
          description: document.querySelector('meta[name="description"]')?.content || "",
          title: document.title,
        };
      });

      const bad = info.links.filter((l) => !l.href || l.href === "#" || l.href.startsWith("javascript"));
      check(`${tag}: no placeholder links`, bad.length === 0, bad.map((l) => l.text).join(", "));
      check(`${tag}: no horizontal scroll`, info.overflow <= 0, `${info.overflow}px`);
      check(`${tag}: headings in Newsreader Light`, /newsreader/i.test(info.h1Font) && info.h1Weight === "300", `${info.h1Font} ${info.h1Weight}`);
      check(`${tag}: body in Instrument Sans`, /instrument.sans/i.test(info.bodyFont), info.bodyFont);
      check(`${tag}: title and description set`, info.title.length > 10 && info.description.length > 40);
      const banned = ["Compartamos", "cada encuentro Junto Select elegible", "privilegio mensual", "Gratis", "fundador"].filter((w) => info.text.includes(w));
      check(`${tag}: no rejected wording`, banned.length === 0, banned.join(", "));
      if (vpName === "desktop") {
        check(`${tag}: nav is Option 1`, info.headerNav.join(" · ") === "El Club · Encuentros · Introducciones · Membresía Select", info.headerNav.join(" · "));
      }
      const footerColab = info.links.filter((l) => l.inFooter && l.text === "Patrocinios y colaboraciones");
      check(`${tag}: one footer sponsorship link`, footerColab.length === 1 && footerColab[0].href === "/colaboraciones");

      // Every internal destination answers 200, and every #anchor exists there.
      if (vpName === "desktop") {
        for (const l of info.links) {
          if (!l.href.startsWith("/")) continue;
          const [pathOnly, hash] = l.href.split("#");
          const status = await statusOf(pathOnly || path);
          check(`${tag}: link "${l.text}" → ${l.href}`, status === 200, `HTTP ${status}`);
          if (hash) {
            const html = await (await fetch(`${APP}${pathOnly || path}`)).text();
            check(`${tag}: anchor #${hash} exists`, html.includes(`id="${hash}"`));
          }
        }
      }
    }

    // Mobile menu
    if (vpName === "mobile") {
      await page.goto(`${APP}/`);
      await page.click("button.burger");
      const items = await page.locator("#site-menu nav a").allTextContents();
      check("mobile menu lists Option 1", items.join(" · ") === "El Club · Encuentros · Introducciones · Membresía Select", items.join(" · "));
      const ctas = await page.locator("#site-menu .ctas a").allTextContents();
      check("mobile menu has Recibir invitaciones and Hazte miembro", ctas.join("|") === "Recibir invitaciones|Hazte miembro", ctas.join("|"));
      await page.screenshot({ path: `${SHOTS}/mobile-menu.png` });
      await page.keyboard.press("Escape");
      check("mobile menu closes with Escape", (await page.locator("#site-menu").count()) === 0);
      await page.click("button.burger");
      await page.click("#site-menu nav >> text=Introducciones");
      await page.waitForURL("**/introducciones");
      check("mobile menu link navigates", page.url().endsWith("/introducciones"));
    }
    await ctx.close();
  }

  // ---- 2. CTA destinations ----
  const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop, locale: "es-ES" });
  const page = await ctx.newPage();
  const href = async (sel) => page.locator(sel).first().getAttribute("href");

  await page.goto(`${APP}/`);
  check("home: Recibir invitaciones → /unete", (await href(".hero >> text=Recibir invitaciones")) === "/unete");
  check("home: header button is Recibir invitaciones → /unete", (await href("header >> text=Recibir invitaciones")) === "/unete");
  check("home: events section offers invitations", (await href(".events .sec-links >> text=Recibir invitaciones")) === "/unete");
  check("home: closing block offers Recibir invitaciones → /unete", (await href(".cities >> text=Recibir invitaciones")) === "/unete");
  check("home: no free/no-cost wording", !/sin coste|sin compromiso|gratis|gratuit/i.test(await page.locator("main").innerText()));
  {
    const sel = (await page.locator(".select").innerText()).replace(/\s+/g, " ");
    check("home: Membresía benefits are the approved three",
      ["Una comunidad selecta", "Búsqueda activa de introducciones", "20 % de descuento en un encuentro al mes"].every((t) => sel.includes(t)) &&
        sel.includes("Más que asistir, pertenecer"));
    check("home: no member-account benefit", !sel.includes("Tu cuenta de miembro") && !sel.includes("Tu propio espacio"));
  }
  check("home: Descubre la Membresía Select → /membresia", (await href(".hero >> text=Descubre la Membresía Select")) === "/membresia");
  check("home: Ver todos los encuentros → /eventos", (await href("text=Ver todos los encuentros")) === "/eventos");
  check("home: Valencia → /unete?ciudad=valencia", (await page.locator('.clist a[href="/unete?ciudad=valencia"]').count()) === 1);
  check("home: Acceder → /introduction", (await href("header >> text=Acceder")) === "/introduction");
  check("home: logo → /", (await href("header a.word")) === "/");

  await page.goto(`${APP}/membresia`);
  for (const [key, price] of [["monthly", "49 €"], ["three_month", "129 €"], ["six_month", "234 €"]]) {
    const btn = page.locator(`a[href="/membresia/alta?plan=${key}"]`);
    check(`membresía: plan ${key} button present`, (await btn.count()) === 1);
    const p2 = await ctx.newPage();
    await p2.goto(`${APP}/membresia/alta?plan=${key}`, { waitUntil: "networkidle" });
    const txt = await p2.locator("body").innerText();
    check(`membresía/alta keeps plan ${key}`, txt.includes(price), price);
    await p2.close();
  }
  check("membresía: Cómo funcionan → /introducciones", (await href("text=Cómo funcionan")) === "/introducciones");
  {
    const body = await page.locator("main").innerText();
    check("membresía: no member-account benefit", !/cuenta de miembro|propio espacio/i.test(body));
    const titles = await page.locator(".p2-grid h3").allInnerTexts();
    check("membresía: benefits in approved order",
      titles.slice(0, 3).join(" | ") === "Una comunidad selecta | Búsqueda activa de introducciones | 20 % de descuento en un encuentro al mes", titles.join(" | "));
  }
  check("membresía: closing link → /unete", (await href(".p2-close >> text=Recibe nuestras invitaciones")) === "/unete");

  await page.goto(`${APP}/membresia/alta?plan=monthly&checkout=cancel`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  check("cancelled checkout shows a no-charge message", (await page.locator("body").innerText()).includes("No se ha realizado ningún cargo"));

  await page.goto(`${APP}/introducciones`);
  check("introducciones: Elige tu modalidad section", (await page.locator("#modalidad h2").innerText()).includes("modalidad"));
  check("introducciones: Crear mi perfil privado → ?modalidad=pasivo", (await href(".p3-cards >> text=Crear mi perfil privado")) === "/introduction?modalidad=pasivo");
  check("introducciones: Empezar la búsqueda activa → ?modalidad=activa", (await href("text=Empezar la búsqueda activa")) === "/introduction?modalidad=activa");
  check("introducciones: both cards answer the same rows", (await page.locator(".p3-card").nth(0).locator("dt").allInnerTexts()).length === 6 &&
    (await page.locator(".p3-card").nth(1).locator("dt").allInnerTexts()).length === 6);
  check("introducciones: Ya soy miembro → sign-in returning to /member/profile", (await href("text=Ya soy miembro")) === "/introduction?next=/member/profile");
  check("introducciones: Madrid only", (await page.locator(".p3-hero .city").innerText()).toLowerCase().includes("madrid"));

  // ---- 3. Free Introductions participant ----
  const freeEmail = `libre.${Date.now()}@example.test`;
  await signInOnIntroduction(page, freeEmail, `${APP}/introduction?modalidad=pasivo`);
  await page.waitForURL("**/introduction/onboarding**", { timeout: 20000 });
  check("free: new account lands in the Introductions onboarding", true);
  await page.waitForTimeout(2000);
  // Found by this run's own email, so data left by other test scripts can't be picked up.
  const freeUid = await getAuth().getUserByEmail(freeEmail).then((u) => u.uid).catch(() => null);
  const freeSnap = freeUid ? await db.doc(`profiles/${freeUid}`).get() : null;
  const freeUser = freeSnap?.exists ? freeSnap : null;
  check("free: private profile created without payment", !!freeUser);
  const billing = freeUser ? await db.doc(`billing/${freeUser.id}`).get() : null;
  check("free: no billing record, search stays passive", billing && !billing.exists && freeUser.data().meta.searchStatus === "passive");
  check("free: chosen modality recorded as passive", freeUser?.data().meta.requestedService === "passive");
  await page.screenshot({ path: `${SHOTS}/free-1-onboarding.png`, fullPage: true });

  if (freeUser) {
    // Test only: give the new profile complete answers so the finalize
    // screen can be exercised (the onboarding screens themselves are unchanged).
    const current = (await db.doc(`profiles/${freeUser.id}`).get()).data();
    await db.doc(`profiles/${freeUser.id}`).set({
      ...current,
      visible: {
        ...current.visible, firstName: "Prueba Libre", gender: "mujer", city: "Madrid", profession: "Médica",
        educationLevel: "universidad", languages: ["es"], hasChildren: false, hasYoungChildren: false,
        wantsFutureChildren: "no", relationshipIntention: "relacion_seria", smoking: "no", drinking: "socialmente",
        activityLevel: "activo", market: "madrid", marketAvailability: "lives_in_market",
      },
      private: { ...current.private, birthDate: new Date("1978-05-20T00:00:00Z"), incomeRange: "40k_80k" },
      dealbreakers: {
        ...current.dealbreakers, gendersSought: ["hombre"], ageMin: 45, ageMax: 60, maxDistance: "misma_ciudad",
        relationshipIntentionsAccepted: ["relacion_seria"], smokingAccepted: ["no"], partnerYoungChildrenMatters: false,
      },
      photos: [`profiles/${freeUser.id}/a.jpg`],
      presentation: { ...current.presentation, status: "approved" },
      meta: { ...current.meta, aboutMeComplete: true, photosComplete: true, preferencesComplete: true, presentationComplete: true },
    });
    await page.goto(`${APP}/member/profile`);
    await page.waitForSelector("text=Guardar y finalizar", { timeout: 20000 });
    await page.click("text=Guardar y finalizar");
    await page.waitForTimeout(800);
    check("free: finalize refused without participation consent", (await page.locator("p[role=alert]").innerText()).includes("confirma que aceptas participar"));
    check("free: profile not finalized without consent", !(await db.doc(`profiles/${freeUser.id}`).get()).data().meta.onboardingFinalized);
    await page.screenshot({ path: `${SHOTS}/free-2-consent.png`, fullPage: true });
    await page.check("text=Acepto participar en las introducciones privadas");
    await page.click("text=Guardar y finalizar");
    await page.waitForTimeout(2500);
    const consent = (await db.doc(`introductionsConsent/${freeUser.id}`).get()).data();
    check("free: consent recorded with terms and privacy versions", consent?.introductionsConsent === true && !!consent.termsVersion && !!consent.privacyVersion);
    const after = (await db.doc(`profiles/${freeUser.id}`).get()).data();
    check("free: profile finalized, still passive (no paid search)", after.meta.onboardingFinalized === true && after.meta.searchStatus === "passive");
    await page.screenshot({ path: `${SHOTS}/free-3-finalized.png`, fullPage: true });

    // ---- 4. Signed-in member following "Ya soy miembro" ----
    await page.goto(`${APP}/introduction?next=/member/profile`);
    await page.waitForURL("**/member/profile", { timeout: 20000 });
    check("signed-in visitor: Ya soy miembro opens /member/profile", page.url().endsWith("/member/profile"));
  }

  // Signed-out: the destination survives an email-link sign-in.
  const ctx2 = await browser.newContext({ viewport: VIEWPORTS.desktop, locale: "es-ES" });
  const p3 = await ctx2.newPage();
  await signInOnIntroduction(p3, "prueba.finalizado@example.test", `${APP}/introduction?next=/member/profile`);
  await p3.waitForURL("**/member/profile", { timeout: 20000 });
  check("signed-out member: sign-in returns to /member/profile", p3.url().endsWith("/member/profile"));
  await p3.goto(`${APP}/introduction?next=//evil.example`);
  await p3.waitForTimeout(2500);
  check("sign-in ignores a foreign next", new URL(p3.url()).host === "localhost:3000");
  await ctx2.close();

  // ---- 4b. Acceder never creates a profile on its own ----
  {
    const c = await browser.newContext({ viewport: VIEWPORTS.desktop, locale: "es-ES" });
    const pg = await c.newPage();
    await pg.goto(`${APP}/member`);
    await pg.waitForURL("**/introduction?**", { timeout: 20000 });
    await pg.waitForTimeout(1500);
    const u = new URL(pg.url());
    check("fresh visitor to /member: sent to sign-in keeping next", u.searchParams.get("next") === "/member" && !u.searchParams.has("session"), pg.url());
    check("fresh visitor to /member: no session-expired message", !(await pg.locator("body").innerText()).includes("caducado"));

    const email = `acceder.${Date.now()}@example.test`;
    await signInOnIntroduction(pg, email, `${APP}/introduction`);
    await pg.waitForSelector("text=Tu cuenta aún no tiene un perfil", { timeout: 20000 });
    await pg.screenshot({ path: `${SHOTS}/acceder-1-tu-cuenta.png`, fullPage: true });
    const uid = await getAuth().getUserByEmail(email).then((x) => x.uid);
    check("Acceder (new account): Tu cuenta shown, no profile created", !(await db.doc(`profiles/${uid}`).get()).exists);
    await pg.goto(`${APP}/introduction/onboarding`);
    await pg.waitForURL((url) => url.pathname === "/introduction", { timeout: 20000 });
    await pg.waitForTimeout(1500);
    check("opening the questionnaire directly creates no profile", !(await db.doc(`profiles/${uid}`).get()).exists);
    await pg.goto(`${APP}/member/plan`);
    await pg.waitForURL((url) => url.pathname === "/introduction", { timeout: 20000 });
    await pg.waitForTimeout(1500);
    check("opening the member area directly creates no profile", !(await db.doc(`profiles/${uid}`).get()).exists);
    await pg.click("text=Crear mi perfil privado");
    await pg.waitForURL("**/introduction/onboarding**", { timeout: 20000 });
    await pg.waitForTimeout(1500);
    const made = (await db.doc(`profiles/${uid}`).get()).data();
    check("Tu cuenta: Crear mi perfil privado creates a passive profile", made?.meta.requestedService === "passive" && !made.meta.onboardingFinalized);
    await c.close();

    // An admin signed in on /admin who clicks Acceder: no profile, admin link offered.
    const ca = await browser.newContext({ viewport: VIEWPORTS.desktop, locale: "es-ES" });
    const pa = await ca.newPage();
    const adminEmail = "admin.local@example.test";
    const adminUid = await getAuth().getUserByEmail(adminEmail).then((x) => x.uid).catch(async () =>
      (await getAuth().createUser({ email: adminEmail, emailVerified: true })).uid);
    const hadProfile = (await db.doc(`profiles/${adminUid}`).get()).exists;
    await signInOnIntroduction(pa, adminEmail, `${APP}/introduction`);
    await pa.waitForSelector("text=Panel de administración", { timeout: 20000 });
    if (!hadProfile) check("admin clicking Acceder: no profile created", !(await db.doc(`profiles/${adminUid}`).get()).exists);
    check("admin clicking Acceder: link back to the admin panel", (await pa.locator("a[href='/admin']").count()) === 1);
    await ca.close();
  }

  // ---- 4c. Active search: profile first, plan step inside the journey ----
  for (const ending of ["pay", "passive"]) {
    const c = await browser.newContext({ viewport: VIEWPORTS.desktop, locale: "es-ES" });
    const pg = await c.newPage();
    const email = `activa.${ending}.${Date.now()}@example.test`;
    await signInOnIntroduction(pg, email, `${APP}/introduction?modalidad=activa`);
    await pg.waitForURL("**/introduction/onboarding**", { timeout: 20000 });
    await pg.waitForTimeout(1500);
    const uid = await getAuth().getUserByEmail(email).then((x) => x.uid);
    const cur = (await db.doc(`profiles/${uid}`).get()).data();
    check(`activa/${ending}: profile created with Select chosen`, cur?.meta.requestedService === "select");
    // Test only: complete answers, as in the free journey above.
    await db.doc(`profiles/${uid}`).set({
      ...cur,
      visible: {
        ...cur.visible, firstName: "Prueba Activa", gender: "hombre", city: "Madrid", profession: "Arquitecto",
        educationLevel: "universidad", languages: ["es"], hasChildren: false, hasYoungChildren: false,
        wantsFutureChildren: "no", relationshipIntention: "relacion_seria", smoking: "no", drinking: "socialmente",
        activityLevel: "activo", market: "madrid", marketAvailability: "lives_in_market",
      },
      private: { ...cur.private, birthDate: new Date("1975-03-10T00:00:00Z"), incomeRange: "40k_80k" },
      dealbreakers: {
        ...cur.dealbreakers, gendersSought: ["mujer"], ageMin: 42, ageMax: 58, maxDistance: "misma_ciudad",
        relationshipIntentionsAccepted: ["relacion_seria"], smokingAccepted: ["no"], partnerYoungChildrenMatters: false,
      },
      photos: [`profiles/${uid}/a.jpg`],
      presentation: { ...cur.presentation, status: "approved" },
      meta: { ...cur.meta, profileStatus: "active_for_matching", aboutMeComplete: true, photosComplete: true, preferencesComplete: true, presentationComplete: true },
    });
    await pg.goto(`${APP}/member/profile`);
    await pg.waitForSelector("text=Elige tu plan", { timeout: 20000 });
    check(`activa/${ending}: plan step shown inside the profile journey`, (await pg.locator("text=Guardar y finalizar").count()) === 0);
    check(`activa/${ending}: passive option explained`, (await pg.locator("body").innerText()).includes("no se propone a nadie"));
    await pg.screenshot({ path: `${SHOTS}/activa-${ending}-1-plan.png`, fullPage: true });

    if (ending === "pay") {
      await pg.check("text=Acepto participar en las introducciones privadas");
      const boxes = pg.locator("label:has-text('He leído y acepto') input, label:has-text('Solicito que mi membresía') input");
      for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check({ force: true });
      await pg.click("text=Continuar al pago");
      await pg.waitForURL("**/pay/**", { timeout: 20000 });
      await pg.click("#pay");
      await pg.waitForURL("**/member/profile?checkout=success**", { timeout: 20000 });
      check(`activa/pay: payment returns to the profile`, true);
      let after;
      for (let i = 0; i < 20; i++) {
        after = (await db.doc(`profiles/${uid}`).get()).data();
        if (after.meta.onboardingFinalized) break;
        await sleep(500);
      }
      check("activa/pay: profile finalized after payment, active search",
        after.meta.onboardingFinalized === true && after.meta.searchStatus === "active_search" && after.meta.requestedService === "select",
        `${after.meta.onboardingFinalized} ${after.meta.searchStatus}`);
      await pg.screenshot({ path: `${SHOTS}/activa-pay-2-done.png`, fullPage: true });
    } else {
      await pg.click("text=Continuar con mi perfil privado");
      await pg.waitForTimeout(1000);
      check("activa/passive: staying passive refused without consent",
        !(await db.doc(`profiles/${uid}`).get()).data().meta.onboardingFinalized &&
          (await pg.locator("p[role=alert]").first().innerText()).includes("confirma que aceptas participar"));
      await pg.check("text=Acepto participar en las introducciones privadas");
      await pg.click("text=Continuar con mi perfil privado");
      await pg.waitForTimeout(2500);
      const after = (await db.doc(`profiles/${uid}`).get()).data();
      check("activa/passive: finalized as passive by explicit choice",
        after.meta.onboardingFinalized === true && after.meta.requestedService === "passive" && after.meta.searchStatus === "passive");
      check("activa/passive: no billing record", !(await db.doc(`billing/${uid}`).get()).exists);
    }
    await c.close();
  }

  // ---- 4d. Footer links open at the top of the new page ----
  {
    const pg = await ctx.newPage();
    for (const [label, path] of [["Proponer una colaboración", "/colaboraciones"], ["Política de privacidad", "/privacidad"], ["Aviso legal", "/aviso-legal"]]) {
      await pg.goto(`${APP}/`);
      await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await pg.waitForTimeout(400);
      const link = pg.locator(`footer >> text=${label}`).first();
      if (!(await link.count())) {
        check(`footer: ${label} link present`, false);
        continue;
      }
      await link.click();
      if (path) await pg.waitForURL(`**${path}`);
      await pg.waitForTimeout(800);
      const y = await pg.evaluate(() => window.scrollY);
      check(`footer: ${label} opens at the top`, y < 5, `scrollY=${y} ${new URL(pg.url()).pathname}`);
    }
    await pg.close();
  }

  // ---- 5. Collaboration form ----
  await page.goto(`${APP}/colaboraciones#propuesta`);
  await page.click("form.fform >> text=Proponer una colaboración");
  check("colaboraciones: empty form shows field errors", (await page.locator(".err").count()) >= 3);
  const fill = async () => {
    await page.fill("input[name=nombre]", "Prueba Marca");
    await page.fill("input[name=marca]", "Marca de prueba");
    await page.fill("input[name=email]", "marca@example.test");
    await page.locator("input[name=tipoColaboracion]").first().check({ force: true });
    await page.fill("textarea[name=mensaje]", "Propuesta de prueba local para un encuentro.");
  };
  await fill();
  await page.route("**/api/colaboraciones", (r) => r.fulfill({ status: 500, body: "{}" }));
  await page.click("form.fform >> text=Proponer una colaboración");
  await page.waitForTimeout(500);
  check("colaboraciones: server failure shows an error, not success", (await page.locator(".form-error").innerText()).includes("No hemos podido enviar"));
  await page.unroute("**/api/colaboraciones");
  const before = (await db.collection("collaborationInquiries").get()).size;
  await page.click("form.fform >> text=Proponer una colaboración");
  await page.waitForSelector(".done", { timeout: 10000 });
  await page.screenshot({ path: `${SHOTS}/colaboraciones-ok.png`, fullPage: true });
  const inquiries = await db.collection("collaborationInquiries").get();
  check("colaboraciones: proposal stored", inquiries.size === before + 1);
  const queued = (await db.collection("outboundEmails").get()).docs.filter((d) => d.id.startsWith("collaboration_"));
  check("colaboraciones: notification queued, not sent", queued.length >= 1 && queued.every((d) => !d.data().sentAt));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) console.log("Failed:\n" + failed.map((f) => " - " + f.name).join("\n"));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
