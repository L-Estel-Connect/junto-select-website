/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Public website audit for v5 (navigation, links, typography, copy, CTAs,
// free Introductions journey, member sign-in return, collaboration form).
//   NODE_PATH=$(npm root -g) node scripts/local-test/site-audit.cjs
// Needs the same setup as journeys.cjs: emulators + start.sh running.
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
      check("mobile menu has Únete al club and Hazte miembro", ctas.join("|") === "Únete al club|Hazte miembro");
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
  check("home: Únete al club → /unete", (await href(".hero >> text=Únete al club")) === "/unete");
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
  check("membresía: closing link → /unete", (await href(".p2-close >> text=Únete al club sin compromiso")) === "/unete");

  await page.goto(`${APP}/membresia/alta?plan=monthly&checkout=cancel`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  check("cancelled checkout shows a no-charge message", (await page.locator("body").innerText()).includes("No se ha realizado ningún cargo"));

  await page.goto(`${APP}/introducciones`);
  check("introducciones: Crear mi perfil privado → /introduction", (await href("text=Crear mi perfil privado")) === "/introduction");
  check("introducciones: Ver la Membresía Select → /membresia", (await href("text=Ver la Membresía Select")) === "/membresia");
  check("introducciones: Ya soy miembro → sign-in returning to /member/profile", (await href("text=Ya soy miembro")) === "/introduction?next=/member/profile");
  check("introducciones: Madrid only", (await page.locator(".p3-hero .city").innerText()).toLowerCase().includes("madrid"));

  // ---- 3. Free Introductions participant ----
  const freeEmail = `libre.${Date.now()}@example.test`;
  await signInOnIntroduction(page, freeEmail, `${APP}/introduction`);
  await page.waitForURL("**/introduction/onboarding**", { timeout: 20000 });
  check("free: new account lands in the Introductions onboarding", true);
  await page.waitForTimeout(2000);
  const freeUser = (await db.collection("profiles").where("meta.searchStatus", "==", "passive").get()).docs.find(
    (d) => !["intro-finalized", "intro-draft", "intro-legacy"].includes(d.id) && !d.data().meta.onboardingFinalized && !d.data().visible.firstName,
  );
  check("free: private profile created without payment", !!freeUser);
  const billing = freeUser ? await db.doc(`billing/${freeUser.id}`).get() : null;
  check("free: no billing record, search stays passive", billing && !billing.exists && freeUser.data().meta.searchStatus === "passive");
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
