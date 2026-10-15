/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Read-only crawl: every public page at desktop/tablet/mobile, every link and
// anchor checked, console errors, broken images, overflow, headings, and where
// signed-out visitors land on member/admin pages. Never submits a form.
// Usage: NODE_PATH=$(npm root -g) node scripts/local-test/link-crawl.cjs [baseUrl] [outDir]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");
const OUT = process.argv[3] || ".local-test/crawl";
fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });

const PUBLIC = [
  "/", "/club", "/eventos", "/matchmaking", "/introducciones", "/membresia", "/membresia/alta",
  "/unete", "/colaboraciones", "/privacidad", "/terminos", "/aviso-legal",
  "/introduction", "/robots.txt", "/sitemap.xml",
];
const GUARDED = [
  "/member", "/member/plan", "/member/profile", "/member/profile/about",
  "/member/profile/photos", "/member/profile/preferences", "/member/profile/presentation",
  "/member/profile/contact", "/member/proposals", "/member/connections", "/member/settings",
  "/member/bienvenida", "/introduction/onboarding", "/introduction/legacy",
  "/reconnect/connections", "/admin", "/admin/eventos", "/admin/members",
  "/admin/matching", "/admin/review", "/admin/proposals", "/admin/introductions",
  "/admin/legacy", "/admin/event-benefits", "/no-existe-esta-pagina",
];
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, tablet: { width: 820, height: 1180 }, mobile: { width: 390, height: 844 } };

const results = [];
const rec = (ok, name, detail = "") => { results.push({ ok, name, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); };

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const statusCache = new Map();
  const linkInventory = new Map(); // href -> Set(pages)

  async function status(ctx, url) {
    if (statusCache.has(url)) return statusCache.get(url);
    let s;
    try { const r = await ctx.request.get(url, { maxRedirects: 5, timeout: 20000 }); s = r.status(); } catch (e) { s = `ERR ${e.message.split("\n")[0]}`; }
    statusCache.set(url, s);
    return s;
  }

  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport: vp, locale: "es-ES" });
    for (const p of PUBLIC) {
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`));
      let resp;
      try { resp = await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 45000 }); } catch (e) { rec(false, `${vpName} ${p} loads`, e.message.split("\n")[0]); await page.close(); continue; }
      rec(resp && resp.status() < 400, `${vpName} ${p} loads`, `status ${resp && resp.status()}, final ${page.url().replace(BASE, "")}`);
      if (p.endsWith(".txt") || p.endsWith(".xml")) { await page.close(); continue; }
      // scroll to trigger lazy images
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); } window.scrollTo(0, 0); });
      await page.waitForTimeout(800);
      const info = await page.evaluate(() => {
        const links = [...document.querySelectorAll("a[href]")].map((a) => ({ href: a.getAttribute("href"), text: (a.innerText || a.getAttribute("aria-label") || "").trim().slice(0, 60), visible: !!(a.offsetWidth || a.offsetHeight) }));
        const brokenImgs = [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src);
        const h1 = [...document.querySelectorAll("h1")].map((h) => h.innerText.trim().slice(0, 80));
        const unnamedButtons = [...document.querySelectorAll("button, a[href]")].filter((b) => (b.offsetWidth || b.offsetHeight) && !(b.innerText || "").trim() && !b.getAttribute("aria-label") && !b.querySelector("img[alt]:not([alt=''])") && !b.getAttribute("title")).length;
        const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const smallTargets = [...document.querySelectorAll("a[href], button")].filter((b) => { const r = b.getBoundingClientRect(); return r.width && r.height && (r.height < 24 || r.width < 24) && (b.innerText || "").trim(); }).map((b) => (b.innerText || "").trim().slice(0, 30));
        const ids = new Set([...document.querySelectorAll("[id]")].map((e) => e.id));
        return { links, brokenImgs, h1, unnamedButtons, overflow, smallTargets: [...new Set(smallTargets)].slice(0, 8), ids: [...ids], title: document.title, desc: document.querySelector("meta[name=description]")?.content || "" };
      });
      rec(errors.length === 0, `${vpName} ${p} no console errors`, errors.slice(0, 3).join(" | "));
      rec(info.brokenImgs.length === 0, `${vpName} ${p} images load`, info.brokenImgs.slice(0, 3).join(", "));
      rec(info.h1.length === 1, `${vpName} ${p} exactly one h1`, info.h1.join(" / "));
      rec(info.overflow <= 1, `${vpName} ${p} no horizontal scroll`, `${info.overflow}px`);
      rec(info.unnamedButtons === 0, `${vpName} ${p} every button/link has a name`, `${info.unnamedButtons} unnamed`);
      if (vpName === "mobile") rec(info.smallTargets.length === 0, `${vpName} ${p} tap targets >= 24px`, info.smallTargets.join(", "));
      if (vpName === "desktop") rec(!!info.title && !!info.desc, `${p} has title and description`, `${info.title} | ${info.desc.slice(0, 80)}`);
      for (const l of info.links) {
        if (!linkInventory.has(l.href)) linkInventory.set(l.href, { pages: new Set(), texts: new Set() });
        linkInventory.get(l.href).pages.add(p); if (l.text) linkInventory.get(l.href).texts.add(l.text);
        if (l.href.startsWith("#")) { const id = decodeURIComponent(l.href.slice(1)); if (id) rec(info.ids.includes(id), `${vpName} ${p} anchor ${l.href} exists`, l.text); }
      }
      await page.screenshot({ path: path.join(OUT, "shots", `${vpName}${p.replace(/\//g, "_") || "_home"}.png`), fullPage: true });
      await page.close();
    }
    // mobile menu
    if (vpName === "mobile") {
      const page = await ctx.newPage();
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      const toggle = page.locator("header button[aria-expanded], header button[aria-controls], header button:has-text('Menú'), header summary").first();
      if (await toggle.count()) {
        await toggle.click(); await page.waitForTimeout(500);
        const items = await page.evaluate(() => [...document.querySelectorAll("header a[href], nav a[href], [role=dialog] a[href]")].filter((a) => a.offsetWidth || a.offsetHeight).map((a) => `${(a.innerText || "").trim()} -> ${a.getAttribute("href")}`));
        rec(items.length >= 5, "mobile menu opens and shows links", items.join(" | "));
        await page.screenshot({ path: path.join(OUT, "shots", "mobile_menu_open.png") });
        await page.keyboard.press("Escape"); await page.waitForTimeout(300);
        const stillOpen = await toggle.getAttribute("aria-expanded").catch(() => null);
        rec(stillOpen !== "true", "mobile menu closes with Escape", `aria-expanded=${stillOpen}`);
      } else rec(false, "mobile menu toggle found");
      await page.close();
    }
    await ctx.close();
  }

  // link targets
  const ctx = await browser.newContext();
  for (const [href, v] of linkInventory) {
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    const url = href.startsWith("http") ? href : BASE + (href.startsWith("/") ? href : "/" + href);
    const internal = url.startsWith(BASE);
    if (!internal && process.env.SKIP_EXTERNAL) { rec(true, `external link listed ${href}`, "not fetched"); continue; }
    const s = await status(ctx, url.split("#")[0]);
    rec(typeof s === "number" && s < 400, `link ${href} resolves`, `status ${s}; on ${[...v.pages].join(",")}; "${[...v.texts].join('" / "')}"`);
  }

  // guarded pages, signed out
  for (const g of GUARDED) {
    const page = await ctx.newPage();
    let r; try { r = await page.goto(BASE + g, { waitUntil: "networkidle", timeout: 30000 }); } catch (e) { rec(false, `signed-out ${g}`, e.message.split("\n")[0]); await page.close(); continue; }
    await page.waitForTimeout(1500);
    const final = page.url().replace(BASE, "");
    const h = await page.evaluate(() => (document.querySelector("h1,h2")?.innerText || "").trim().slice(0, 80));
    const leak = await page.evaluate(() => /@|uid|undefined|NaN|Error/.test(document.body.innerText.slice(0, 4000)));
    rec(!leak, `signed-out ${g}`, `status ${r && r.status()}, lands on ${final}, heading "${h}"`);
    await page.screenshot({ path: path.join(OUT, "shots", `signedout${g.replace(/\//g, "_")}.png`) });
    await page.close();
  }

  // API guards: member/admin APIs must refuse anonymous calls
  const apis = [["GET", "/api/account/status"], ["POST", "/api/member/delete-profile"], ["GET", "/api/admin/dashboard/members"], ["GET", "/api/admin/dashboard/overview"], ["POST", "/api/admin/matching/run-cycle"], ["POST", "/api/billing/create-checkout-session"], ["POST", "/api/billing/create-portal-session"], ["GET", "/api/member/proposals"], ["POST", "/api/member/photo"], ["POST", "/api/introduction/generate-presentation"], ["POST", "/api/member/event-benefit"], ["GET", "/api/admin/events"], ["POST", "/api/membership/start"], ["GET", "/api/member/reconnect/active"]];
  for (const [m, a] of apis) {
    let s; try { const r = await ctx.request.fetch(BASE + a, { method: m, data: m === "POST" ? {} : undefined }); s = r.status(); } catch { s = "ERR"; }
    rec([401, 403, 404, 405].includes(s), `anonymous ${m} ${a} refused`, `status ${s}`);
  }

  await browser.close();
  const inv = [...linkInventory].map(([href, v]) => ({ href, pages: [...v.pages], texts: [...v.texts] }));
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, links: inv }, null, 1));
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
})();
