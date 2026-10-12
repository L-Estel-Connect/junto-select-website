/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// API-level tests for the admin Events Manager, against the local build
// (emulators + mock Stripe/Brevo/Ticket Tailor):
//   set -a; . ./.env.local; set +a
//   node scripts/local-test/events-manager.cjs
// Covers create, edit, publish, unpublish, archive, Ticket Tailor import
// (mock), statuses, adding the Ticket Tailor link later, image upload,
// what the public pages show, and that the 20 % benefit follows its own
// switch, independent of publishing. Test events use ids starting with
// 91000 or "manual_" and are deleted at the start and end.
const fs = require("node:fs");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const project = process.env.GCLOUD_PROJECT || "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !project.startsWith("demo-")) {
  console.error("Refusing to run outside the emulators.");
  process.exit(1);
}
initializeApp({ projectId: project });
const auth = getAuth();
const db = getFirestore();

const APP = "http://localhost:3000";
const AUTH_EMU = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
const MOCK_LOG = ".local-test/mock-log.jsonl";
const ADMIN_EMAIL = (process.env.ADMIN_ALLOWLIST_EMAILS || "").split(",")[0].trim();
const TEST_TITLE = "Prueba EM";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const mockLog = () =>
  fs.existsSync(MOCK_LOG) ? fs.readFileSync(MOCK_LOG, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
const madridYMD = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const inDays = (n) => madridYMD(new Date(Date.now() + n * 86400000));

async function tokenForEmail(email, uidIfNew) {
  let uid;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
  } catch {
    uid = (await auth.createUser({ uid: uidIfNew, email, emailVerified: true })).uid;
  }
  const custom = await auth.createCustomToken(uid);
  const res = await fetch(`${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  return { uid, token: (await res.json()).idToken };
}
async function api(token, method, path, body) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${APP}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}
const page = async (path) => (await fetch(`${APP}${path}`)).text();
const eventDoc = async (id) => (await db.doc(`eligibleTicketTailorEvents/${id}`).get()).data();

async function cleanup() {
  const snap = await db.collection("eligibleTicketTailorEvents").get();
  for (const d of snap.docs) {
    if (d.id.startsWith("91000") || (d.id.startsWith("manual_") && String(d.data().label).startsWith(TEST_TITLE)) || d.id === "em-legacy") {
      await d.ref.delete();
    }
  }
  for (const c of ["eventParticipants", "eventBenefits", "eventBenefitCycles"]) {
    const s = await db.collection(c).where("emTest", "==", true).get();
    for (const d of s.docs) await d.ref.delete();
  }
  const uid = "em-member";
  for (const c of ["profiles", "billing", "membershipSignups"]) await db.doc(`${c}/${uid}`).delete();
  for (const c of ["eventBenefits", "eventBenefitCycles"]) {
    const s = await db.collection(c).where("uid", "==", uid).get();
    for (const d of s.docs) await d.ref.delete();
  }
}

async function pay(token, uid) {
  const start = await api(token, "POST", "/api/membership/start", {
    planKey: "monthly", ageConfirmed: true, termsAccepted: true, immediateServiceRequested: true, marketAvailability: "lives_in_market",
  });
  if (!start.data?.url) throw new Error(`checkout failed: ${JSON.stringify(start.data)}`);
  const res = await fetch(start.data.url, { method: "POST", redirect: "manual" });
  if (res.status !== 303) throw new Error(`mock pay failed: ${res.status}`);
  return (await db.doc(`billing/${uid}`).get()).data().stripeSubscriptionId;
}

async function main() {
  await cleanup();
  const { token: admin } = await tokenForEmail(ADMIN_EMAIL, "em-admin");
  const { token: stranger } = await tokenForEmail("em-stranger@example.test", "em-stranger");

  // A record made by the old benefits page, with none of the new fields.
  await db.doc("eligibleTicketTailorEvents/em-legacy").set({
    ticketTailorEventId: "em-legacy", ticketTailorTicketTypeIds: ["tt_legacy"], label: "Evento antiguo EM", eventDate: inDays(8),
    memberBenefitEnabled: true, reconnectEnabled: false, reconnectForceClosedAt: null, ticketTailorCheckoutUrl: "https://www.tickettailor.com/events/x/1",
    createdAt: new Date(), updatedAt: new Date(), lastSyncedAt: null, lastSyncResult: null,
  });

  // ---- Access ----
  check("access: non-admin refused", [401, 403].includes((await api(stranger, "GET", "/api/admin/events")).status));
  check("access: signed out refused", [401, 403].includes((await api(null, "GET", "/api/admin/events")).status));
  check("access: non-admin cannot import", [401, 403].includes((await api(stranger, "POST", "/api/admin/events/import", { ref: "2439069" })).status));

  // ---- Ticket Tailor import (mock, read-only) ----
  const logBefore = mockLog().length;
  const before2439069 = JSON.stringify((await eventDoc("2439069")) ?? null);
  const imp = await api(admin, "POST", "/api/admin/events/import", { ref: "https://www.tickettailor.com/events/juntoselect/2439069" });
  const f = imp.data?.import?.fields ?? {};
  check("import: reads the event", imp.status === 200 && imp.data.import.ticketTailorEventId === "2439069", JSON.stringify(imp.data).slice(0, 200));
  check("import: title, date and times", f.label === "Junto Select OCTOBER 2026" && f.eventDate === "2026-10-29" && f.startTime === "20:00" && f.endTime === "23:00");
  check("import: booking link is the pasted link", f.ticketTailorCheckoutUrl === "https://www.tickettailor.com/events/juntoselect/2439069");
  check("import: image and ticket types", f.imageUrl?.startsWith("https://uploads.tickettailorassets.com/") && JSON.stringify(f.ticketTailorTicketTypeIds) === '["tt_mock1","tt_mock2"]');
  check("import: suggests Entradas disponibles", f.publicStatus === "tickets_available");
  check("import: venue shown as a note, not copied", !("venuePublic" in f) && imp.data.import.notes.some((n) => n.includes("MOCK venue")));
  check("import: city, type and public venue left to the admin", ["ciudad", "tipo de evento", "descripción para la web", "descripción pública del lugar"].every((m) => imp.data.import.missing.includes(m)));
  check("import: price not imported", !("priceFromEuros" in f));
  check("import: Ticket Tailor description kept apart from the site copy", !("description" in f) && /corazón de Madrid/.test(imp.data.import.ticketTailorDescription ?? ""));
  check("import: nothing saved", JSON.stringify((await eventDoc("2439069")) ?? null) === before2439069);
  const ttCalls = mockLog().slice(logBefore).filter((e) => e.service === "tickettailor");
  check("import: only reads from Ticket Tailor", ttCalls.length > 0 && ttCalls.every((e) => e.kind === "event_get"), ttCalls.map((e) => e.kind).join(","));
  const nf = await api(admin, "POST", "/api/admin/events/import", { ref: "9100099" });
  check("import: unknown event gives a plain message", nf.status === 404 && /no encuentra/.test(nf.data?.error), nf.data?.error);
  const bad = await api(admin, "POST", "/api/admin/events/import", { ref: "hola" });
  check("import: bad link gives a plain message", bad.status === 400 && /Pega el enlace/.test(bad.data?.error));

  // ---- Create ----
  const ttEvent = {
    ticketTailorRef: "https://www.tickettailor.com/events/juntoselect/9100001",
    label: `${TEST_TITLE} con entradas`, eventType: "Signature", city: "Madrid", eventDate: inDays(12), startTime: "20:00", endTime: "23:00",
    description: "Descripción de prueba.", imageUrl: "/images/private-curated.png", publicStatus: "tickets_available",
    ticketTailorCheckoutUrl: "https://www.tickettailor.com/events/juntoselect/9100001", memberBenefitEnabled: true,
    ticketTailorTicketTypeIds: ["tt_em1"], reconnectEnabled: false,
  };
  const c1 = await api(admin, "POST", "/api/admin/events", ttEvent);
  check("create: from a Ticket Tailor link uses its number", c1.status === 200 && c1.data.id === "9100001", JSON.stringify(c1.data));
  const d1 = await eventDoc("9100001");
  check("create: starts unpublished", d1.published === false && d1.ticketTailorLinked === true && d1.publicStatus === "tickets_available");
  check("create: same Ticket Tailor event twice refused", (await api(admin, "POST", "/api/admin/events", ttEvent)).data?.error?.startsWith("already_exists"));
  check("create: missing title refused in Spanish", /título/.test((await api(admin, "POST", "/api/admin/events", { ...ttEvent, ticketTailorRef: "9100009", label: "" })).data?.error));
  check("create: tickets available without link refused", /enlace de compra/.test((await api(admin, "POST", "/api/admin/events", { ...ttEvent, ticketTailorRef: "9100009", ticketTailorCheckoutUrl: "" })).data?.error));

  const manual = {
    label: `${TEST_TITLE} próximamente`, eventType: "Signature", city: "Madrid", eventDate: inDays(30), startTime: "", endTime: "",
    venuePublic: "", description: "", imageUrl: "/images/who-you-meet.png", priceFromEuros: null, publicStatus: "coming_soon",
    ticketTailorCheckoutUrl: "", memberBenefitEnabled: false, ticketTailorTicketTypeIds: [],
  };
  const c2 = await api(admin, "POST", "/api/admin/events", manual);
  const manualId = c2.data?.id;
  check("create: without Ticket Tailor gets a manual id", c2.status === 200 && /^manual_[0-9a-f]{12}$/.test(manualId), JSON.stringify(c2.data));
  check("create: manual event cannot offer the 20 %", /Ticket Tailor/.test((await api(admin, "POST", "/api/admin/events", { ...manual, memberBenefitEnabled: true, ticketTailorTicketTypeIds: ["tt_x"] })).data?.error));

  const draft = await api(admin, "POST", "/api/admin/events", { label: `${TEST_TITLE} borrador`, publicStatus: "draft" });
  check("create: draft without a date", draft.status === 200);

  // ---- Nothing public before publishing ----
  let html = await page("/eventos");
  check("public: unpublished events are not shown", !html.includes(TEST_TITLE));
  check("public: older records stay hidden until published", !html.includes("Evento antiguo EM"));

  // ---- Publish ----
  check("publish: draft refused", /Para publicar/.test((await api(admin, "POST", `/api/admin/events/${draft.data.id}/publish`, { published: true })).data?.error));
  check("publish: tickets event", (await api(admin, "POST", "/api/admin/events/9100001/publish", { published: true })).status === 200);
  check("publish: coming soon event", (await api(admin, "POST", `/api/admin/events/${manualId}/publish`, { published: true })).status === 200);
  html = await page("/eventos");
  const iTickets = html.indexOf(`${TEST_TITLE} con entradas`);
  const iSoon = html.indexOf(`${TEST_TITLE} próximamente`);
  check("public /eventos: both published events shown", iTickets > 0 && iSoon > 0);
  check("public /eventos: in date order", iTickets < iSoon);
  check("public /eventos: Reservar links to Ticket Tailor", html.includes('href="https://www.tickettailor.com/events/juntoselect/9100001"'));
  const soonCard = html.slice(iSoon, html.indexOf("</article>", iSoon));
  check("public /eventos: coming soon shows no purchase link", !/tickettailor\.com/.test(soonCard) && /Próximamente/.test(soonCard), soonCard.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200));
  const home = await page("/");
  check("public home: shows the next events", home.includes(`${TEST_TITLE} con entradas`));

  // ---- Edit ----
  const e1 = await api(admin, "PUT", "/api/admin/events/9100001", { ...ttEvent, ticketTailorRef: "", label: `${TEST_TITLE} con entradas (editado)`, venuePublic: "Un salón privado en Chamberí" });
  check("edit: saved", e1.status === 200 && e1.data.id === "9100001");
  html = await page("/eventos");
  check("edit: website updates", html.includes(`${TEST_TITLE} con entradas (editado)`) && html.includes("Un salón privado en Chamberí"));
  check("edit: stays published", (await eventDoc("9100001")).published === true);
  check("edit: cannot switch to another Ticket Tailor event",
    (await api(admin, "PUT", "/api/admin/events/9100001", { ...ttEvent, ticketTailorRef: "9100002" })).data?.error?.startsWith("ticket_tailor_change_not_allowed"));

  // ---- Statuses ----
  await api(admin, "PUT", "/api/admin/events/9100001", { ...ttEvent, ticketTailorRef: "", publicStatus: "sold_out" });
  html = await page("/eventos");
  const iSold = html.indexOf(`${TEST_TITLE} con entradas`);
  const soldCard = html.slice(iSold, html.indexOf("</article>", iSold));
  check("status Completo: shown without purchase link", iSold > 0 && /Completo/.test(soldCard) && !/href="https:\/\/www\.tickettailor/.test(soldCard));
  await api(admin, "PUT", "/api/admin/events/9100001", { ...ttEvent, ticketTailorRef: "", publicStatus: "completed" });
  check("status Finalizado: leaves the website", !(await page("/eventos")).includes(`${TEST_TITLE} con entradas`));
  await api(admin, "PUT", "/api/admin/events/9100001", { ...ttEvent, ticketTailorRef: "", publicStatus: "draft" });
  check("status Borrador: unpublishes", (await eventDoc("9100001")).published === false);
  await api(admin, "PUT", "/api/admin/events/9100001", ttEvent.ticketTailorRef ? { ...ttEvent, ticketTailorRef: "" } : ttEvent);
  await api(admin, "POST", "/api/admin/events/9100001/publish", { published: true });

  // ---- 20 % benefit is independent of publishing ----
  const { uid: memberUid, token: member } = await tokenForEmail("em-member@example.test", "em-member");
  await pay(member, memberUid);
  // Benefit on, but not published.
  await api(admin, "POST", "/api/admin/events", { ...ttEvent, ticketTailorRef: "9100003", label: `${TEST_TITLE} solo miembros`, eventDate: inDays(15), ticketTailorCheckoutUrl: "https://www.tickettailor.com/events/juntoselect/9100003" });
  // Published, benefit off.
  await api(admin, "POST", "/api/admin/events", { ...ttEvent, ticketTailorRef: "9100004", label: `${TEST_TITLE} sin descuento`, eventDate: inDays(16), memberBenefitEnabled: false, ticketTailorCheckoutUrl: "https://www.tickettailor.com/events/juntoselect/9100004" });
  await api(admin, "POST", "/api/admin/events/9100004/publish", { published: true });
  let s = (await api(member, "GET", "/api/member/event-benefit")).data;
  let claimable = (s?.claimableEvents ?? []).map((e) => e.ticketTailorEventId);
  check("benefit: published event with 20 % on is offered", claimable.includes("9100001"), claimable.join(","));
  check("benefit: unpublished event with 20 % on is still offered", claimable.includes("9100003"));
  check("benefit: published event with 20 % off is not offered", !claimable.includes("9100004"));
  check("benefit: manual event is not offered", !claimable.includes(manualId));
  check("benefit: older records keep working", claimable.includes("em-legacy"));
  html = await page("/eventos");
  check("public: 20 % tag only where the benefit is on",
    /20/.test(html.slice(html.indexOf(`${TEST_TITLE} con entradas`), html.indexOf("</article>", html.indexOf(`${TEST_TITLE} con entradas`)))) &&
    !/20\s?%/.test(html.slice(html.indexOf(`${TEST_TITLE} sin descuento`), html.indexOf("</article>", html.indexOf(`${TEST_TITLE} sin descuento`)))));

  // ---- Archive ----
  const a = await api(admin, "POST", "/api/admin/events/9100003/archive", { archived: true });
  check("archive: done", a.status === 200 && !!(await eventDoc("9100003")).archivedAt);
  s = (await api(member, "GET", "/api/member/event-benefit")).data;
  check("archive: no longer offered to members", !s.claimableEvents.some((e) => e.ticketTailorEventId === "9100003"));
  check("archive: cannot be claimed directly", (await api(member, "POST", "/api/member/event-benefit", { ticketTailorEventId: "9100003" })).status === 409);
  check("archive: cannot be published", /Restaura/.test((await api(admin, "POST", "/api/admin/events/9100003/publish", { published: true })).data?.error));
  await api(admin, "POST", "/api/admin/events/9100004/archive", { archived: true });
  check("archive: published event leaves the website", !(await page("/eventos")).includes(`${TEST_TITLE} sin descuento`) && (await eventDoc("9100004")).published === false);
  await api(admin, "POST", "/api/admin/events/9100003/archive", { archived: false });
  s = (await api(member, "GET", "/api/member/event-benefit")).data;
  check("restore: offered again, still unpublished", s.claimableEvents.some((e) => e.ticketTailorEventId === "9100003") && (await eventDoc("9100003")).published === false);
  const list = (await api(admin, "GET", "/api/admin/events")).data.events;
  check("admin list: includes archived and older records", list.some((e) => e.ticketTailorEventId === "9100004" && e.archivedAt) && list.some((e) => e.ticketTailorEventId === "em-legacy"));

  // ---- Claim through the existing engine ----
  const logMark = mockLog().length;
  const cl = await api(member, "POST", "/api/member/event-benefit", { ticketTailorEventId: "9100001" });
  const created = mockLog().slice(logMark).filter((e) => e.service === "tickettailor" && e.kind === "discount_create");
  check("benefit: member claims the 20 % for a managed event", cl.status === 200 && cl.data.benefit?.code, JSON.stringify(cl.data));
  check("benefit: code scoped to the event's ticket types (mock Ticket Tailor)", created.length === 1 && JSON.stringify(created[0].data.ticket_types) === '["tt_em1"]');
  const rows = (await api(admin, "GET", "/api/admin/events")).data.events;
  check("admin list: counts codes per event", rows.find((e) => e.ticketTailorEventId === "9100001")?.benefitCount === 1);

  // ---- Add the Ticket Tailor link later ----
  const linkPayload = { ...manual, ticketTailorRef: "https://www.tickettailor.com/events/juntoselect/9100005", publicStatus: "tickets_available", ticketTailorCheckoutUrl: "https://www.tickettailor.com/events/juntoselect/9100005" };
  const linked = await api(admin, "PUT", `/api/admin/events/${manualId}`, linkPayload);
  check("link later: moves to the Ticket Tailor number", linked.status === 200 && linked.data.id === "9100005", JSON.stringify(linked.data));
  const d5 = await eventDoc("9100005");
  check("link later: keeps publication and details", d5?.published === true && d5.ticketTailorLinked === true && d5.label === manual.label);
  check("link later: old manual record removed", !(await eventDoc(manualId)));
  html = await page("/eventos");
  check("link later: website now links to checkout", html.includes('href="https://www.tickettailor.com/events/juntoselect/9100005"'));
  // A manual event that already has Reconnect data can't be moved.
  const c3 = await api(admin, "POST", "/api/admin/events", { ...manual, label: `${TEST_TITLE} con datos` });
  await db.doc(`eventParticipants/em-${c3.data.id}`).set({ ticketTailorEventId: c3.data.id, emTest: true });
  check("link later: refused when the event already has data",
    (await api(admin, "PUT", `/api/admin/events/${c3.data.id}`, { ...manual, label: `${TEST_TITLE} con datos`, ticketTailorRef: "9100006" })).data?.error?.startsWith("event_in_use"));
  check("link later: refused when that Ticket Tailor event exists",
    (await api(admin, "PUT", `/api/admin/events/${draft.data.id}`, { label: `${TEST_TITLE} borrador`, ticketTailorRef: "9100001" })).data?.error?.startsWith("already_exists"));

  // ---- Old benefits route keeps the new fields ----
  await api(admin, "POST", "/api/admin/event-benefits/eligible-events", {
    ticketTailorEventId: "9100001", ticketTailorTicketTypeIds: ["tt_em1"], label: `${TEST_TITLE} con entradas`, eventDate: ttEvent.eventDate,
    memberBenefitEnabled: true, reconnectEnabled: true, ticketTailorCheckoutUrl: ttEvent.ticketTailorCheckoutUrl,
  });
  const d1b = await eventDoc("9100001");
  check("compat: old benefits route keeps publication fields", d1b.published === true && d1b.publicStatus === "tickets_available" && d1b.eventType === "Signature" && d1b.reconnectEnabled === true);

  // ---- Image upload ----
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const fd = new FormData();
  fd.append("file", new Blob([png], { type: "image/png" }), "x.png");
  fd.append("eventId", "9100001");
  const up = await fetch(`${APP}/api/admin/events/image`, { method: "POST", headers: { authorization: `Bearer ${admin}` }, body: fd }).then((r) => r.json());
  check("image: upload returns a site URL", up.ok && /^\/api\/events\/image\?path=events\/9100001\/\d+\.png$/.test(up.url), JSON.stringify(up));
  const img = await fetch(`${APP}${up.url}`);
  check("image: served publicly", img.status === 200 && img.headers.get("content-type") === "image/png");
  const fd2 = new FormData();
  fd2.append("file", new Blob(["<svg/>"], { type: "image/svg+xml" }), "x.svg");
  fd2.append("eventId", "9100001");
  check("image: other file types refused", (await fetch(`${APP}/api/admin/events/image`, { method: "POST", headers: { authorization: `Bearer ${admin}` }, body: fd2 })).status === 400);
  const fd3 = new FormData();
  fd3.append("file", new Blob([png], { type: "image/png" }), "x.png");
  fd3.append("eventId", "9100001");
  check("image: non-admin refused", [401, 403].includes((await fetch(`${APP}/api/admin/events/image`, { method: "POST", headers: { authorization: `Bearer ${stranger}` }, body: fd3 })).status));
  check("image: other storage paths refused", (await fetch(`${APP}/api/events/image?path=${encodeURIComponent("profiles/x/1.jpg")}`)).status === 400);
  const withImg = await api(admin, "PUT", "/api/admin/events/9100001", { ...ttEvent, ticketTailorRef: "", imageUrl: up.url });
  check("image: uploaded image accepted on the event", withImg.status === 200 && (await eventDoc("9100001")).imageUrl === up.url);

  // ---- Preview page ----
  const prev = await fetch(`${APP}/eventos/vista-previa?id=9100003`);
  const prevHtml = await prev.text();
  check("preview: page served and not indexed", prev.status === 200 && /noindex/.test(prevHtml));

  await cleanup();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
