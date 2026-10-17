/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Full Reconnect walk-through on the local emulators (no live services):
//   set -a; . ./.env.local; set +a
//   node scripts/local-test/reconnect.cjs
// Event id 91000777 and rc.*@example.test accounts, deleted at the start and end.
const fs = require("node:fs");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const project = process.env.GCLOUD_PROJECT || "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !project.startsWith("demo-")) { console.error("emulators only"); process.exit(1); }
initializeApp({ projectId: project });
const auth = getAuth(), db = getFirestore();
const APP = "http://localhost:3000", AUTH_EMU = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
const EV = "91000777";
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  (" + d + ")" : ""}`); };
const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const inDays = (n) => ymd(new Date(Date.now() + n * 86400000));
async function token(email) {
  let uid; try { uid = (await auth.getUserByEmail(email)).uid; } catch { uid = (await auth.createUser({ email, emailVerified: true })).uid; }
  const r = await fetch(`${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: await auth.createCustomToken(uid), returnSecureToken: true }) });
  return { uid, token: (await r.json()).idToken };
}
async function api(t, method, path, body) {
  const h = { "content-type": "application/json" }; if (t) h.authorization = `Bearer ${t.token}`;
  const r = await fetch(APP + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {} return { status: r.status, data };
}
const P = ["ana", "bruno", "carmen", "diego", "elena"].map((n) => `rc.${n}@example.test`);
const OUT = "rc.intruso@example.test";
async function cleanup() {
  await db.doc(`eligibleTicketTailorEvents/${EV}`).delete();
  for (const c of ["eventParticipants", "eventReconnectRequests"]) for (const d of (await db.collection(c).where("eventId", "==", EV).get()).docs) await d.ref.delete();
  for (const d of (await db.collection("introductions").where("eventId", "==", EV).get()).docs) await d.ref.delete();
  for (const e of [...P, OUT]) { try { const u = await auth.getUserByEmail(e); await db.doc(`profiles/${u.uid}`).delete(); await auth.deleteUser(u.uid); } catch {} }
}
(async () => {
  await cleanup();
  const admin = await token((process.env.ADMIN_ALLOWLIST_EMAILS || "").split(",")[0]);
  const form = (over) => ({ label: "Prueba Reconnect", eventType: "Signature", eventDate: inDays(-1), startTime: "20:00", endTime: "23:00", city: "Madrid", venuePublic: "", description: "", imageUrl: "/images/private-curated.png", priceFromEuros: null, publicStatus: "coming_soon", ticketTailorCheckoutUrl: "", memberBenefitEnabled: false, ticketTailorTicketTypeIds: [], reconnectEnabled: false, ...over });

  // 1. New event from the Eventos dashboard: Reconnect is off by default.
  const c = await api(admin, "POST", "/api/admin/events", { ...form({}), reconnectEnabled: undefined, ticketTailorRef: `https://www.tickettailor.com/events/juntoselect/${EV}` });
  check("create event (Eventos dashboard API)", c.status === 200 && c.data.id === EV, JSON.stringify(c.data));
  let doc = (await db.doc(`eligibleTicketTailorEvents/${EV}`).get()).data();
  check("new event: reconnectEnabled = false by default", doc?.reconnectEnabled === false);

  // 2. Import the Ticket Tailor attendee list (5 people).
  const dry = await api(admin, "POST", "/api/admin/event-reconnect/import-participants", { eventId: EV, dryRun: true, rows: [{ email: P[0] }, { email: "no-es-un-email" }] });
  check("preview writes nothing and ignores invalid emails", dry.data?.preview?.valid === 1 && dry.data.preview.alreadyImported.length === 0 && (await db.collection("eventParticipants").where("eventId", "==", EV).get()).empty, JSON.stringify(dry.data));
  const imp = await api(admin, "POST", "/api/admin/event-reconnect/import-participants", { eventId: EV, rows: P.map((e, i) => ({ email: e.toUpperCase(), firstName: ["Ana", "Bruno", "Carmen", "Diego", "Elena"][i], lastName: "Secreto" })) });
  check("import 5 attendees", imp.data?.result?.imported === 5, JSON.stringify(imp.data));
  const imp2 = await api(admin, "POST", "/api/admin/event-reconnect/import-participants", { eventId: EV, rows: [{ email: P[0] }] });
  check("re-import is idempotent", imp2.data?.result?.alreadyImported === 1);
  const dry2 = await api(admin, "POST", "/api/admin/event-reconnect/import-participants", { eventId: EV, dryRun: true, rows: [{ email: P[0] }, { email: "nuevo@example.test" }] });
  check("preview lists who is already imported", JSON.stringify(dry2.data?.preview?.alreadyImported) === JSON.stringify([P[0]]));

  const [A, B, C, D] = await Promise.all(P.map(token));
  const X = await token(OUT);
  let s = await api(A, "GET", `/api/member/reconnect/${EV}/state`);
  check("Reconnect off -> closed for participants", s.data?.state?.windowState === "discovery_closed", s.data?.state?.windowState);

  // 3. Switch it on (same save the "Reconnect activado" checkbox does).
  const u = await api(admin, "PUT", `/api/admin/events/${EV}`, form({ reconnectEnabled: true }));
  check("enable Reconnect via Guardar cambios", u.status === 200 && (await db.doc(`eligibleTicketTailorEvents/${EV}`).get()).data().reconnectEnabled === true, JSON.stringify(u.data));
  const rows = await api(admin, "GET", "/api/admin/events");
  check("dashboard row now shows reconnectEnabled", rows.data.events.find((e) => e.ticketTailorEventId === EV)?.reconnectEnabled === true);
  s = await api(A, "GET", `/api/member/reconnect/${EV}/state`);
  check("event was yesterday -> window open today", s.data?.state?.windowState === "open" && s.data.state.isParticipant && !s.data.state.isActivated, JSON.stringify(s.data?.state));

  // 4. Verification: not on the Ticket Tailor list -> refused.
  const xs = await api(X, "GET", `/api/member/reconnect/${EV}/state`);
  check("non-attendee: isParticipant=false", xs.data?.state?.isParticipant === false || xs.status === 404, JSON.stringify(xs.data));
  const xa = await api(X, "POST", "/api/member/reconnect/activate", { eventId: EV, firstName: "Intruso", contactMethod: "email" });
  check("non-attendee cannot activate", xa.data?.error === "event_not_participant", JSON.stringify(xa.data));
  const xg = await api(X, "GET", `/api/member/reconnect/${EV}/gallery`);
  check("non-attendee cannot see the gallery", xg.status === 403, String(xg.status));
  const ag0 = await api(A, "GET", `/api/member/reconnect/${EV}/gallery`);
  check("attendee must activate before seeing the gallery", ag0.status === 403 && ag0.data?.error === "not_activated");

  // 5. Activation (first name + contact method + consent).
  const a1 = await api(A, "POST", "/api/member/reconnect/activate", { eventId: EV, firstName: "Ana", contactMethod: "whatsapp", contactValue: "+34 611 111 111", showPhotoInReconnect: true });
  const b1 = await api(B, "POST", "/api/member/reconnect/activate", { eventId: EV, firstName: "Bruno", contactMethod: "email", showPhotoInReconnect: false });
  check("Ana and Bruno activate", a1.data?.ok && b1.data?.ok, JSON.stringify([a1.data, b1.data]));
  s = await api(A, "GET", `/api/member/reconnect/${EV}/state`);
  check("3 requests available after activation", s.data.state.requestsRemaining === 3);

  // 6. Gallery: attendees of this event only, first names only for non-activated.
  const g = await api(A, "GET", `/api/member/reconnect/${EV}/gallery`);
  const names = (g.data?.results || []).map((r) => r.firstName).sort();
  check("gallery lists the 5 attendees of this event", names.join() === "Ana,Bruno,Carmen,Diego,Elena", names.join());
  check("gallery never shows the outsider", !names.includes("Intruso"));
  const carmen = g.data.results.find((r) => r.firstName === "Carmen");
  check("non-activated attendee: first name only, no photo", carmen.activated === false && carmen.photoPath === null);
  check("gallery card has no surname/email/phone", !JSON.stringify(g.data).match(/Secreto|@example|611/));
  const id = (n) => g.data.results.find((r) => r.firstName === n).participantId;

  // 7. Requests: max 3 per participant per event.
  const r1 = await api(A, "POST", `/api/member/reconnect/${EV}/request`, { targetParticipantId: id("Bruno") });
  const r2 = await api(A, "POST", `/api/member/reconnect/${EV}/request`, { targetParticipantId: id("Carmen") });
  const r3 = await api(A, "POST", `/api/member/reconnect/${EV}/request`, { targetParticipantId: id("Diego") });
  check("3 requests sent, remaining 2/1/0", [r1, r2, r3].map((r) => r.data?.requestsRemaining).join() === "2,1,0", JSON.stringify([r1.data, r2.data, r3.data]));
  const r4 = await api(A, "POST", `/api/member/reconnect/${EV}/request`, { targetParticipantId: id("Elena") });
  check("4th request refused", r4.status >= 400, JSON.stringify(r4.data));
  const dup = await api(B, "POST", `/api/member/reconnect/${EV}/request`, { targetParticipantId: id("Ana") });
  check("reverse request on an existing pair does not create a second one", (await db.collection("eventReconnectRequests").where("eventId", "==", EV).get()).size === 3, JSON.stringify(dup.data));

  const ap = await api(A, "GET", "/api/member/reconnect/pending");
  const sentNames = (ap.data?.results || []).filter((r) => r.direction === "sent").map((r) => r.otherFirstName).sort();
  check("sent requests show first names, also for people not activated yet", sentNames.join() === "Bruno,Carmen,Diego", sentNames.join());
  check("pending list never shows surname/email/phone", !JSON.stringify(ap.data).match(/Secreto|@example|611/));
  const st = await api(A, "GET", `/api/member/reconnect/${EV}/state`);
  check("state carries opening and closing times", !!st.data.state.opensAt && new Date(st.data.state.closesAt) - new Date(st.data.state.opensAt) === 48 * 3600e3);

  // 8. Privacy before acceptance.
  const cp = await api(C, "GET", "/api/member/reconnect/pending");
  check("Carmen (not activated) does not see the request yet", (cp.data?.results || []).length === 0);
  const bp = await api(B, "GET", "/api/member/reconnect/pending");
  const req = (bp.data?.results || []).find((r) => r.direction === "received");
  check("Bruno sees Ana's request", req?.otherFirstName === "Ana", JSON.stringify(bp.data));
  check("no introduction / contact before Bruno answers", (await db.collection("introductions").where("eventId", "==", EV).get()).empty);

  // 9. Mutual interest -> connection with contact details.
  const dec = await api(B, "POST", `/api/member/reconnect/requests/${req.id}/decide`, { decision: "accept" });
  check("Bruno accepts", dec.data?.status === "accepted", JSON.stringify(dec.data));
  const intro = await api(A, "GET", `/api/member/introductions/${req.id}`);
  check("Ana now sees Bruno's contact (email)", JSON.stringify(intro.data).includes(P[1]), JSON.stringify(intro.data?.introduction?.contacts));
  const intro2 = await api(B, "GET", `/api/member/introductions/${req.id}`);
  check("Bruno sees Ana's WhatsApp", JSON.stringify(intro2.data).includes("611 111 111"));
  const introX = await api(X, "GET", `/api/member/introductions/${req.id}`);
  check("an outsider cannot open that connection", introX.status >= 400);

  // 10. Admin: summary, force close, reopen.
  const sum = await api(admin, "GET", `/api/admin/event-reconnect/summary?eventId=${EV}`);
  check("admin summary", JSON.stringify(sum.data?.summary) === JSON.stringify({ participantsImported: 5, activated: 2, optedOut: 0, requestsSent: 3, accepted: 1 }), JSON.stringify(sum.data?.summary));
  await api(admin, "POST", "/api/admin/event-reconnect/force-close", { ticketTailorEventId: EV, forceClosed: true });
  s = await api(A, "GET", `/api/member/reconnect/${EV}/state`);
  check("Forzar cierre -> closed", s.data.state.windowState === "discovery_closed");
  check("gallery refused while closed", (await api(A, "GET", `/api/member/reconnect/${EV}/gallery`)).status === 403);
  check("existing connection still readable after close", (await api(A, "GET", `/api/member/introductions/${req.id}`)).status === 200);
  await api(admin, "POST", "/api/admin/event-reconnect/force-close", { ticketTailorEventId: EV, forceClosed: false });
  s = await api(A, "GET", `/api/member/reconnect/${EV}/state`);
  check("Reabrir -> open again (inside the 48 h)", s.data.state.windowState === "open");

  // 11. Timing, by moving the event date.
  await api(admin, "PUT", `/api/admin/events/${EV}`, form({ eventDate: inDays(0), reconnectEnabled: true }));
  s = await api(A, "GET", `/api/member/reconnect/${EV}/state`);
  check("event today -> not yet open", s.data.state.windowState === "not_yet_open", s.data.state.windowState);
  await api(admin, "PUT", `/api/admin/events/${EV}`, form({ eventDate: inDays(-3), publicStatus: "completed", reconnectEnabled: true }));
  s = await api(A, "GET", `/api/member/reconnect/${EV}/state`);
  check("event 3 days ago -> closed automatically", s.data.state.windowState === "discovery_closed", s.data.state.windowState);
  const late = await api(D, "GET", `/api/member/reconnect/${EV}/state`);
  check("Diego can still activate to answer a request received within 72 h", late.data.state.hasPendingIncomingRequest === true);
  await api(admin, "PUT", `/api/admin/events/${EV}`, form({ eventDate: inDays(-1), reconnectEnabled: false }));
  s = await api(A, "GET", `/api/member/reconnect/${EV}/state`);
  check("switching Reconnect off closes it", s.data.state.windowState === "discovery_closed");
  check("history kept when switched off", (await db.collection("eventReconnectRequests").where("eventId", "==", EV).get()).size === 3 && (await db.collection("introductions").where("eventId", "==", EV).get()).size === 1);

  // 12. Emails are only queued, never sent here.
  const mail = fs.existsSync(".local-test/mock-log.jsonl") ? fs.readFileSync(".local-test/mock-log.jsonl", "utf8").split("\n").filter((l) => l.includes("transactional_email") && l.includes("rc.")).length : 0;
  check("no email sent", mail === 0);
  const queued = (await db.collection("outboundEmails").get()).docs.map((d) => d.data()).filter((d) => d.eventId === EV || JSON.stringify(d).includes(EV));
  console.log("queued (not sent) emails:", queued.map((q) => q.type).join(", ") || "none");

  if (!process.argv.includes("--keep")) await cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
