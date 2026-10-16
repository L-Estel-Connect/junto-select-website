/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Browser walk-through of Clientes, against the local build and emulators:
//   set -a; . ./.env.local; set +a
//   node scripts/local-test/matchmaking.cjs seed
//   NODE_PATH=$(npm root -g) node scripts/local-test/matchmaking-ui.cjs
//   node scripts/local-test/matchmaking.cjs clean
// Creates a client from scratch through the real screens, searches, opens a
// profile, preselects two people and marks one presented. Screenshots go to
// .local-test/screens/clientes-*.png.
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
const ADMIN_EMAIL = (process.env.ADMIN_ALLOWLIST_EMAILS || "").split(",")[0].trim();
const OUT = ".local-test/screens";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function adminLogin(page) {
  const user = await getAuth().getUserByEmail(ADMIN_EMAIL).catch(() => getAuth().createUser({ email: ADMIN_EMAIL, emailVerified: true }));
  const custom = await getAuth().createCustomToken(user.uid);
  const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const t = await res.json();
  const stored = {
    uid: user.uid, email: ADMIN_EMAIL, emailVerified: true, isAnonymous: false, providerData: [],
    stsTokenManager: { refreshToken: t.refreshToken, accessToken: t.idToken, expirationTime: Date.now() + 3500 * 1000 },
    createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey: API_KEY, appName: "[DEFAULT]",
  };
  await page.goto(`${APP}/admin/login`, { waitUntil: "networkidle" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`firebase:authUser:${API_KEY}:[DEFAULT]`, JSON.stringify(stored)]);
  const session = await page.request.post(`${APP}/api/admin/session`, { data: { idToken: t.idToken } });
  if (!session.ok()) throw new Error(`admin session refused: ${session.status()}`);
  await page.goto(`${APP}/admin/clientes`, { waitUntil: "networkidle" });
}

const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}/clientes-${name}.png`, fullPage });

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-ES" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const count = async (c) => (await db.collection(c).count().get()).data().count;
  const before = { proposals: await count("proposals"), emails: await count("outboundEmails") };
  await adminLogin(page);
  await page.getByRole("heading", { name: "Clientes" }).waitFor();
  const menu = page.getByRole("navigation").first();
  check("menu shows only Clientes, Solicitudes, Candidatos and Eventos",
    (await menu.getByRole("link", { name: "Clientes" }).count()) > 0 && (await menu.getByRole("link", { name: "Solicitudes" }).count()) > 0 &&
    (await menu.getByRole("link", { name: "Candidatos" }).count()) > 0 && (await menu.getByRole("link", { name: "Eventos" }).count()) > 0 &&
    (await page.getByText("Archivo").count()) === 0 && (await menu.getByRole("link", { name: /Matching|Propuestas|Introducciones|Revisión|Legacy/ }).count()) === 0);
  await shot(page, "1-lista");

  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  await page.waitForURL(/\/admin\/clientes\/[^/]+$/);
  const clientId = page.url().split("/").pop();
  await page.getByText("Programa y pago").waitFor();
  check("new client opens on its ficha", await page.getByRole("button", { name: "Buscar perfiles compatibles" }).isDisabled());

  await page.getByRole("button", { name: /Programa Select/ }).click();
  const field = (label) => page.locator("label", { hasText: label }).locator("input, select").first();
  await field("Nombre").fill("Carlos");
  await field("Apellidos").fill("Ejemplo");
  await field("Edad").fill("52");
  await field("Inicio del programa").fill("2026-10-15");
  await field("Ciudad").fill("Pozuelo");
  await page.getByText("Pozuelo de Alarcón").first().waitFor({ timeout: 10000 });
  check("city typed as «Pozuelo» is placed as Pozuelo de Alarcón", true);
  // One questionnaire row, found by its question.
  const q = (label) => page.locator("div.grid", { has: page.locator(`p:text-is("${label}")`) }).first();
  const pickIn = async (label, option) => q(label).getByRole("radio", { name: option, exact: true }).click();
  const chipIn = async (label, option) => q(label).getByRole("button", { name: option, exact: true }).click();
  check("search waits for the answers the filters need", (await page.getByText(/Falta en la ficha:.*si fuma/).count()) === 1);
  await pickIn("Género", "Hombre");
  await pickIn("Hijos", "Sí, todos de 15 años o más");
  await pickIn("Qué tipo de relación busca", "Una relación seria");
  await pickIn("¿Fuma?", "No");
  await pickIn("¿Bebe alcohol?", "Socialmente");
  await pickIn("Actividad física", "Activo/a — varias veces por semana");
  await pickIn("Busca", "Mujeres");
  await q("Edad").getByPlaceholder("Mín.").fill("44");
  await q("Edad").getByPlaceholder("Máx.").fill("58");
  await pickIn("Distancia", "Misma ciudad");
  await chipIn("Tipo de relación que debe buscar la otra persona", "Una relación seria");
  await chipIn("¿Aceptaría a alguien que fuma?", "No");
  await chipIn("¿Aceptaría a alguien que fuma?", "Socialmente");
  await pickIn("¿Le importaría que tuviera hijos menores de 15 años?", "No le importaría");
  await page.getByText("Guardado").waitFor({ timeout: 10000 });
  await page.waitForTimeout(1200);
  const stored = (await db.doc(`clients/${clientId}`).get()).data();
  check("ficha saves itself", stored.firstName === "Carlos" && stored.ageYears === 52 && stored.placeIne === "28115" && stored.programme === "select" && stored.profile.dealbreakers.ageMax === 58,
    `${stored.firstName} ${stored.ageYears} ${stored.placeIne} ${stored.programme}`);
  check("programme end filled in", (await field("Fin del programa").inputValue()) === "2027-04-14");
  await shot(page, "2-ficha");

  await page.getByRole("button", { name: "Buscar perfiles compatibles" }).click();
  await page.getByText(/compatibles en esta zona/).waitFor({ timeout: 20000 });
  await page.locator("ol > li").first().waitFor({ timeout: 10000 }).catch(() => {});
  const rows = page.locator("ol > li");
  const names = await rows.locator("span.font-serif").allTextContents();
  check("results listed, ranked, in Select's local zone", names.includes("Lucía") && names.includes("Marta") && !names.includes("Inés"), names.join(", "));
  await shot(page, "3-compatibles");

  await page.getByLabel("Zona").selectOption("espana");
  await page.getByLabel("Mostrar también los no compatibles").check();
  await page.getByText("Inés").first().waitFor();
  check("toggle shows non-compatible people with the reason", await page.getByText(/Distancia \/ ciudad/).first().isVisible());
  await shot(page, "4-no-compatibles");
  await page.getByLabel("Mostrar también los no compatibles").uncheck();
  await page.getByLabel("Zona").selectOption("50");

  await rows.first().getByRole("button", { name: "Ver perfil completo" }).click();
  const panel = page.getByRole("dialog", { name: "Perfil del candidato" });
  await panel.getByText("Puntuación de compatibilidad").waitFor();
  check("profile panel: score explanation, presentation, contact", await panel.getByText("Presentación aprobada").isVisible() && await panel.getByText("Contacto").isVisible());
  await shot(page, "5-perfil", false);
  await panel.getByRole("button", { name: "Preseleccionar" }).first().click();
  await panel.getByText(/En la preselección/).waitFor();
  await panel.getByRole("button", { name: "← Volver a la lista" }).click();

  await rows.nth(1).getByRole("button", { name: "Preseleccionar" }).click();
  await rows.nth(1).getByText("✓ Preseleccionado").waitFor();
  check("one click adds to the preselection", true);

  await page.getByRole("button", { name: /Preselección \(2\)/ }).click();
  await page.getByLabel("Estado", { exact: true }).first().selectOption("presentado");
  await page.getByText(/Presentados\s*1\s*de 3/).waitFor({ timeout: 10000 });
  check("marking someone Presentado counts 1 of 3", true);
  await page.getByPlaceholder("Notas privadas sobre esta propuesta").first().fill("Le encaja por viajes y deporte");
  await page.getByRole("heading", { name: "Carlos Ejemplo" }).click();
  await page.getByText("Nota guardada").waitFor();
  await shot(page, "6-preseleccion");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Ficha" }).click();
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("phone width: no sideways scrolling", overflow <= 1, `${overflow}px`);
  await shot(page, "7-movil");
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto(`${APP}/admin/clientes`, { waitUntil: "networkidle" });
  await page.getByText("Carlos Ejemplo").waitFor();
  check("client listed with 1 of 3 presented", await page.getByText(/1 de 3/).first().isVisible());
  await shot(page, "8-lista-final");

  // ---- Solicitudes: converting creates the client ----
  await page.goto(`${APP}/admin/solicitudes`, { waitUntil: "networkidle" });
  const inqRow = page.locator("tr", { hasText: "Andrés" }).first();
  await inqRow.waitFor();
  await shot(page, "9-solicitudes");
  await inqRow.getByRole("button", { name: "Convertir en cliente" }).click();
  await page.waitForURL(/\/admin\/clientes\/[^/]+$/, { timeout: 15000 });
  await page.getByRole("heading", { name: /Andrés/ }).waitFor();
  check("Convertir en cliente opens the new client's ficha", true);
  await page.goto(`${APP}/admin/solicitudes`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Ya son clientes/ }).click();
  check("the request stays, under «Ya son clientes», with a link to the ficha",
    await page.locator("tr", { hasText: "Andrés" }).getByRole("link", { name: /Ver ficha del cliente/ }).isVisible());
  await page.goto(`${APP}/admin/clientes`, { waitUntil: "networkidle" });
  check("…and the client is in Clientes", await page.getByText("Andrés Prueba").first().isVisible());

  // ---- Candidatos ----
  await page.goto(`${APP}/admin/members`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Candidatos" }).waitFor();
  await page.getByText("Lucía").first().waitFor({ timeout: 15000 });
  check("Candidatos: no membership filters or counters", (await page.getByText(/Membres|Select activo|suscrip/i).count()) === 0);
  await page.getByRole("button", { name: "Mujeres", exact: true }).click();
  const womenOnly = !(await page.locator("tbody").getByText("Hombre", { exact: true }).count());
  await page.getByLabel("Perfiles incompletos").check();
  const incompleteOnly = (await page.locator("tbody").getByText("Completo", { exact: true }).count()) === 0 && (await page.locator("tbody tr").count()) > 0;
  check("Candidatos: Mujeres + Perfiles incompletos combine", womenOnly && incompleteOnly);
  await shot(page, "10-candidatos");

  const proposals = (await count("proposals")) - before.proposals;
  const emails = (await count("outboundEmails")) - before.emails;
  check("nothing sent: no new proposals or emails", proposals === 0 && emails === 0, `${proposals} proposals, ${emails} emails`);
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
