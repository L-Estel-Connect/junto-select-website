/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Visual and layout audit of every public page at five realistic screen sizes.
// Read-only: it only opens pages, so it is safe against staging too.
//   NODE_PATH=$(npm root -g) node scripts/local-test/layout-audit.cjs [base-url]
// Default base: http://localhost:3000. Screenshots: .local-test/layout/<size>/.
//
// What it catches that link and copy checks don't: a form control blown up by
// a stray class (the 760 px "Ciudad" dropdown), clipped buttons, broken or
// heavily upscaled photos, horizontal scroll, and the same photo used twice.
const fs = require("node:fs");
const { chromium } = require("playwright");

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");
const OUT = ".local-test/layout";
const PAGES = [
  "/", "/club", "/eventos", "/introducciones", "/membresia", "/membresia/alta?plan=three_month", "/unete",
  "/unete?ciudad=valencia", "/colaboraciones", "/privacidad", "/aviso-legal", "/terminos", "/introduction",
];
const SIZES = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
  small: { width: 360, height: 740 },
};

// Pages whose photo repeats Lara accepted (13 Oct 2026): excluded from the
// "used once" count, still checked for loading and stretching.
const REPEATS_ACCEPTED = new Set(["/colaboraciones"]);

const results = [];
const warnings = new Set();
function check(name, ok, detail = "") {
  results.push({ name, ok });
  if (!ok || process.env.VERBOSE) console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const slug = (p) => (p === "/" ? "inicio" : p.replace(/^\//, "").replace(/[/?=&]/g, "-"));

(async () => {
  const browser = await chromium.launch();
  const photoUse = new Map(); // photo file → set of "page section"

  for (const [size, viewport] of Object.entries(SIZES)) {
    fs.mkdirSync(`${OUT}/${size}`, { recursive: true });
    const ctx = await browser.newContext({ viewport, locale: "es-ES", deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      const tag = `${size} ${path}`;
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      check(`${tag}: loads`, res && res.status() === 200, `HTTP ${res && res.status()}`);
      // Scroll through so lazy images load, then back to the top.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 150));
        }
        window.scrollTo(0, 0);
      });
      // Lazy photos: wait until every image has finished (or 10 s over a slow network).
      await page
        .waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 10000 })
        .catch(() => {});
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${size}/${slug(path)}.png`, fullPage: true });

      const info = await page.evaluate(() => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
        };
        const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""}`;
        const controls = [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea")]
          .filter((el) => visible(el) && !el.closest("[aria-hidden=true]"))
          .map((el) => ({ el: describe(el), h: Math.round(el.getBoundingClientRect().height), tag: el.tagName }));
        const fields = [...document.querySelectorAll(".field, .field-row")].filter(visible).map((el) => {
          // Tallest gap between consecutive children: a broken field leaves a hole.
          const kids = [...el.children].filter(visible).map((k) => k.getBoundingClientRect());
          let gap = 0;
          for (let i = 1; i < kids.length; i++) gap = Math.max(gap, kids[i].top - kids[i - 1].bottom);
          return { el: describe(el), gap: Math.round(gap), h: Math.round(el.getBoundingClientRect().height) };
        });
        const clipped = [...document.querySelectorAll(".btn, button, label, a")]
          .filter(visible)
          .filter((el) => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== "visible")
          .map((el) => `${describe(el)} "${el.textContent.trim().slice(0, 30)}"`);
        const offscreen = [...document.querySelectorAll("body *")]
          .filter(visible)
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.right > document.documentElement.clientWidth + 1 && !el.closest("[aria-hidden=true], .ph, .photo");
          })
          .map((el) => describe(el))
          .slice(0, 3);
        const images = [...document.querySelectorAll("img")].filter(visible).map((img) => {
          const r = img.getBoundingClientRect();
          const url = new URL(img.currentSrc || img.src, location.href);
          const file = decodeURIComponent(url.searchParams.get("url") || url.pathname).split("/").pop().replace(/\.[a-f0-9]{8,}\./, ".");
          const section = img.closest("section, header, footer");
          return {
            file,
            loaded: img.complete && img.naturalWidth > 0,
            // How much the original is stretched where it is shown (object-fit cover).
            scale: Math.max(r.width / (img.naturalWidth || 1), r.height / (img.naturalHeight || 1)),
            section: section ? describe(section) : "page",
            event: !!img.closest(".ev, .event, [data-event]"),
          };
        });
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          controls, fields, clipped, offscreen, images,
        };
      });

      check(`${tag}: no horizontal scroll`, info.overflow <= 0, `${info.overflow}px ${info.offscreen.join(", ")}`);
      for (const c of info.controls) {
        const max = c.tag === "TEXTAREA" ? 260 : 80;
        check(`${tag}: ${c.el} has a normal height`, c.h >= 28 && c.h <= max, `${c.h}px`);
      }
      for (const f of info.fields) check(`${tag}: ${f.el} has no hole`, f.gap <= 48, `gap ${f.gap}px, height ${f.h}px`);
      check(`${tag}: no clipped buttons or labels`, info.clipped.length === 0, info.clipped.join(" | "));
      for (const img of info.images) {
        check(`${tag}: photo ${img.file} loads`, img.loaded);
        // Natural size here is what next/image served for this screen, so a
        // high scale means the original itself is too small for the slot.
        if (img.loaded && !img.event) {
          // Above ×2 a photo looks broken; between ×1.35 and ×2 it is soft on
          // large screens, which only a larger original can fix (warning).
          check(`${tag}: photo ${img.file} not stretched beyond ×2`, img.scale <= 2, `×${img.scale.toFixed(2)} in ${img.section}`);
          if (img.scale > 1.35) warnings.add(`${img.file} ×${img.scale.toFixed(2)} at ${size} in ${path} ${img.section}`);
        }
        if (size === "desktop" && !img.event && !REPEATS_ACCEPTED.has(path)) {
          if (!photoUse.has(img.file)) photoUse.set(img.file, new Set());
          photoUse.get(img.file).add(`${path} ${img.section}`);
        }
      }
    }
    await ctx.close();
  }

  console.log("\nPhoto use (desktop):");
  for (const [file, uses] of photoUse) {
    console.log(`  ${file}: ${[...uses].join(" · ")}`);
    check(`photo ${file} used once across the site`, uses.size === 1, [...uses].join(" · "));
  }

  if (warnings.size) console.log("\nWarnings (original smaller than the slot; soft on large screens):\n  " + [...warnings].join("\n  "));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} layout checks passed (${BASE})`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
