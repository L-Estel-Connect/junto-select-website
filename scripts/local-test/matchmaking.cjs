/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// API-level tests for the private matchmaking V1 (Clientes), against the
// local build and the Firebase emulators:
//   set -a; . ./.env.local; set +a
//   node scripts/local-test/matchmaking.cjs
// Seeds made-up candidates in several cities (ids start with "mm-"), then:
// admin security, create/edit a client, convert a request, national search
// and the 20 km rule, full ranking, candidate detail, shortlist, no
// automatic proposals or emails, profile editing rules, profile deletion,
// and Reconnect end to end. Test data is removed at the start of each run.
//   node scripts/local-test/matchmaking.cjs seed    only seed (for matchmaking-ui.cjs)
//   node scripts/local-test/matchmaking.cjs clean   only remove the test data
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const crypto = require("node:crypto");

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
const FS_EMU = `http://${process.env.FIRESTORE_EMULATOR_HOST}`;
const ADMIN_EMAIL = (process.env.ADMIN_ALLOWLIST_EMAILS || "").split(",")[0].trim();
const EVENT_ID = "mm-reconnect-ev";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function tokenForEmail(email, uid) {
  try {
    await auth.getUser(uid);
  } catch {
    await auth.createUser({ uid, email, emailVerified: true });
  }
  const custom = await auth.createCustomToken(uid);
  const res = await fetch(`${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  return (await res.json()).idToken;
}

async function api(token, method, path, body) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${APP}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

const ts = (iso) => Timestamp.fromDate(new Date(iso));
const yearsAgo = (n) => ts(`${new Date().getUTCFullYear() - n}-03-01T00:00:00Z`);

/** A finished candidate profile, as the questionnaire leaves it. */
function profile(uid, { name, city, gender = "mujer", age = 50, seeks = "hombre", ageMin = 45, ageMax = 62, distance = "sin_limite", photos = 2, over = {} }) {
  return {
    visible: {
      firstName: name, gender, city, profession: "Profesional", educationLevel: "universidad", heightCm: 168,
      languages: ["espanol", "ingles"], hasChildren: false, hasYoungChildren: false, childrenCount: null, childrenBirthYears: null,
      wantsFutureChildren: "no", relationshipIntention: "relacion_seria", smoking: "no", drinking: "socialmente",
      activityLevel: "activo", market: "madrid", marketAvailability: "lives_in_market", ...(over.visible || {}),
    },
    private: { birthDate: yearsAgo(age), incomeRange: "40k_80k" },
    dealbreakers: {
      gendersSought: [seeks], ageMin, ageMax, maxDistance: distance, relationshipIntentionsAccepted: ["relacion_seria"],
      smokingAccepted: ["no", "socialmente"], partnerYoungChildrenMatters: false,
    },
    preferences: { heightMinCm: null, heightMaxCm: null, drinkingAccepted: [], activityLevelsPreferred: [] },
    photos: Array.from({ length: photos }, (_, i) => `profiles/${uid}/photos/${i}.jpg`),
    presentation: { status: "approved", approvedText: `${name} es una persona tranquila y curiosa.`, draftText: "", rejectionReason: null },
    contactPreferences: { preferredMethod: "whatsapp", additionalMethods: [], phone: "600000000", instagram: null, linkedin: null },
    meta: {
      onboardingStepIndex: 9, aboutMeComplete: true, photosComplete: photos > 0, preferencesComplete: true, presentationComplete: true,
      profileStatus: "active_for_matching", onboardingFinalized: true, searchStatus: "passive", duplicateStatus: "clear",
      duplicateOf: null, personId: uid, pendingLegacyActivation: false, legacyImportId: null, matchingAnchorAt: null,
      matchingSubscriptionId: null, matchingPeriodsProcessed: 0, nextMatchingDueAt: null,
      createdAt: ts("2026-05-01T10:00:00Z"), updatedAt: ts("2026-09-20T10:00:00Z"), ...(over.meta || {}),
    },
  };
}

const CANDIDATES = [
  { uid: "mm-madrid", name: "Lucía", city: "Madrid", age: 49 },
  { uid: "mm-pozuelo", name: "Marta", city: "Pozuelo", age: 52 },
  { uid: "mm-lasrozas", name: "Elena", city: "Las Rozas", age: 47, photos: 1 },
  { uid: "mm-nophotos", name: "Eva", city: "Madrid", age: 47, photos: 0 },
  { uid: "mm-alcala", name: "Carmen", city: "Alcalá de Henares", age: 50 },
  { uid: "mm-toledo", name: "Rosa", city: "Toledo", age: 55 },
  { uid: "mm-valencia", name: "Inés", city: "Valencia", age: 48 },
  { uid: "mm-valencia-strict", name: "Pilar", city: "Valencia", age: 51, distance: "misma_ciudad" },
  { uid: "mm-barcelona", name: "Núria", city: "Barcelona", age: 46 },
  { uid: "mm-villanueva", name: "Teresa", city: "Villanueva", age: 53 },
  { uid: "mm-old", name: "Amparo", city: "Madrid", age: 66 },
  { uid: "mm-smoker", name: "Silvia", city: "Madrid", age: 50, over: { visible: { smoking: "habitualmente" } } },
  { uid: "mm-man", name: "Javier", city: "Madrid", age: 50, gender: "hombre", seeks: "mujer" },
  { uid: "mm-delete-me", name: "Beatriz", city: "Getafe", age: 50 },
  { uid: "mm-delete-pre", name: "Sonia", city: "Madrid", age: 51 },
  { uid: "mm-draft", name: "Clara", city: "Madrid", age: 50, over: { meta: { profileStatus: "draft", preferencesComplete: false } } },
  { uid: "mm-dup", name: "Lucía bis", city: "Madrid", age: 49, over: { meta: { duplicateStatus: "confirmed_duplicate", duplicateOf: "mm-madrid", personId: "mm-madrid" } } },
];
const emailOf = (uid) => `${uid}@example.test`;

async function deleteWhere(collection, field, prefixOrValues) {
  const snap = await db.collection(collection).get();
  const batch = db.batch();
  let n = 0;
  for (const d of snap.docs) {
    const v = field === "__id" ? d.id : d.get(field);
    if (typeof v === "string" && prefixOrValues.some((p) => v.startsWith(p))) {
      batch.delete(d.ref);
      n++;
    }
  }
  if (n) await batch.commit();
}

async function cleanup() {
  for (const c of CANDIDATES) {
    await db.doc(`profiles/${c.uid}`).delete();
    await db.doc(`users/${c.uid}`).delete();
    await auth.deleteUser(c.uid).catch(() => {});
  }
  await deleteWhere("clients", "createdBy", [ADMIN_EMAIL]);
  await deleteWhere("clientShortlist", "__id", [""]);
  await deleteWhere("candidateLocations", "__id", ["mm-"]);
  await deleteWhere("matchmakingInquiries", "__id", ["mm-"]);
  await deleteWhere("eventParticipants", "eventId", [EVENT_ID]);
  await deleteWhere("eventReconnectRequests", "eventId", [EVENT_ID]);
  await db.doc(`eligibleTicketTailorEvents/${EVENT_ID}`).delete();
}

async function countAll(collection) {
  return (await db.collection(collection).count().get()).data().count;
}

async function seed() {
  for (const c of CANDIDATES) {
    await auth.createUser({ uid: c.uid, email: emailOf(c.uid), emailVerified: true }).catch(() => {});
    await db.doc(`users/${c.uid}`).set({ email: emailOf(c.uid), createdAt: ts("2026-05-01T10:00:00Z") });
    await db.doc(`profiles/${c.uid}`).set(profile(c.uid, c));
  }
  await db.doc("matchmakingInquiries/mm-inq-1").set({
    nombre: "Andrés", apellidos: "Prueba", email: "andres.prueba@example.test", telefono: "611111111", canal: "whatsapp",
    edad: 54, ciudad: "Pozuelo", programa: "privado", objetivo: "relacion_estable", busca: "Alguien con quien viajar",
    edadDesde: 44, edadHasta: 56, status: "nueva", createdAt: ts("2026-10-14T10:00:00Z"),
  });
  // Converted by changing its status to "Cliente" (the bug Lara hit on staging).
  await db.doc("matchmakingInquiries/mm-inq-2").set({
    nombre: "Inés", apellidos: "Prueba", email: "ines.prueba@example.test", telefono: "633333333", canal: "email",
    edad: 47, ciudad: "Madrid", programa: "select", objetivo: "relacion_estable", busca: "Conversación y calma",
    edadDesde: 45, edadHasta: 58, status: "contactada", createdAt: ts("2026-10-15T10:00:00Z"),
  });
  // Same email as a client created in the test: converting it must link, not duplicate.
  await db.doc("matchmakingInquiries/mm-inq-3").set({
    nombre: "Carlos", apellidos: "Prueba", email: "Carlos.Prueba@example.test", telefono: "622222222", canal: "whatsapp",
    edad: 52, ciudad: "Madrid", programa: "select", objetivo: "relacion_estable", busca: "Segunda solicitud",
    status: "nueva", createdAt: ts("2026-10-15T11:00:00Z"),
  });
}

const FULL_PROFILE = {
  visible: {
    gender: "hombre", profession: "Abogado", educationLevel: "universidad", heightCm: 180, languages: ["espanol", "ingles"],
    hasChildren: true, hasYoungChildren: false, wantsFutureChildren: "no", relationshipIntention: "relacion_seria",
    smoking: "no", drinking: "socialmente", activityLevel: "activo",
  },
  incomeRange: "80k_150k",
  dealbreakers: {
    gendersSought: ["mujer"], ageMin: 44, ageMax: 58, maxDistance: "misma_ciudad",
    relationshipIntentionsAccepted: ["relacion_seria"], smokingAccepted: ["no", "socialmente"], partnerYoungChildrenMatters: false,
  },
  preferences: { heightMinCm: 155, heightMaxCm: 178, drinkingAccepted: ["no", "socialmente"], activityLevelsPreferred: ["activo", "muy_activo"] },
};

(async () => {
  await cleanup();
  // `seed` leaves the test data in place for the UI walk-through; `clean` removes it.
  if (process.argv[2] === "clean") process.exit(0);
  await seed();
  if (process.argv[2] === "seed") process.exit(0);
  const admin = await tokenForEmail(ADMIN_EMAIL, "mm-admin");
  const stranger = await tokenForEmail("mm-stranger@example.test", "mm-stranger");
  const before = {
    proposals: await countAll("proposals"),
    invitations: await countAll("invitations"),
    introductions: await countAll("introductions"),
    outboundEmails: await countAll("outboundEmails"),
    pairHistory: await countAll("pairHistory"),
  };

  // --- Admin security ---------------------------------------------------------
  const guarded = [
    ["GET", "/api/admin/clients"],
    ["POST", "/api/admin/clients", {}],
    ["GET", "/api/admin/clients/x"],
    ["PATCH", "/api/admin/clients/x", { notes: "x" }],
    ["POST", "/api/admin/clients/x/search"],
    ["GET", "/api/admin/clients/x/candidates/mm-madrid"],
    ["POST", "/api/admin/clients/x/shortlist", { candidateUid: "mm-madrid" }],
    ["PATCH", "/api/admin/clients/x/shortlist/y", { status: "contactado" }],
    ["DELETE", "/api/admin/clients/x/shortlist/y"],
    ["GET", "/api/admin/places?q=madrid"],
    ["PUT", "/api/admin/candidate-locations/mm-villanueva", { ine: "28079" }],
    ["GET", "/api/admin/candidates"],
    ["PATCH", "/api/admin/dashboard/inquiries/mm-inq-2", { status: "cliente" }],
  ];
  let anonOk = true;
  let strangerOk = true;
  for (const [m, p, b] of guarded) {
    const a = await api(null, m, p, b);
    const s = await api(stranger, m, p, b);
    if (a.status !== 401) anonOk = false;
    if (![401, 403].includes(s.status)) strangerOk = false;
  }
  check(`admin APIs refuse anonymous calls (${guarded.length} routes)`, anonOk);
  check(`admin APIs refuse a signed-in non-admin (${guarded.length} routes)`, strangerOk);
  const page = await fetch(`${APP}/admin/clientes`, { redirect: "manual" });
  check("Clientes page redirects when signed out", [302, 303, 307, 308].includes(page.status), String(page.status));

  // --- Create and complete a client ----------------------------------------------
  const created = await api(admin, "POST", "/api/admin/clients", {});
  const id = created.json.client?.id;
  check("create an empty client", created.status === 200 && !!id);
  const blankSearch = await api(admin, "POST", `/api/admin/clients/${id}/search`);
  check("search on an empty client asks for the missing fields", blankSearch.json.missing?.length >= 10 && blankSearch.json.missing.includes("si fuma") && blankSearch.json.results.length === 0, (blankSearch.json.missing || []).join(", "));

  const patched = await api(admin, "PATCH", `/api/admin/clients/${id}`, {
    firstName: "Carlos", lastName: "Prueba", email: "carlos.prueba@example.test", phone: "622222222", channel: "whatsapp",
    ageYears: 52, city: "Madrid", programme: "select", programmeStart: "2026-10-15", status: "activo",
    profile: FULL_PROFILE, valuesInterests: "Cultura, viajes", dealbreakersNotes: "No quiere fumadores", notes: "Muy claro con lo que busca",
  });
  const c = patched.json.client;
  check("client saved with the questionnaire answers", patched.status === 200 && c.profile.visible.activityLevel === "activo" && c.profile.dealbreakers.ageMax === 58);
  check("city placed on its own: Madrid → 28079", c.placeIne === "28079");
  check("programme end filled in: 15 Oct → 14 Apr", c.programmeEnd === "2027-04-14", c.programmeEnd);
  check("price filled in from the programme: 1.950 €", c.payment.amountEur === 1950);
  const bad = await api(admin, "PATCH", `/api/admin/clients/${id}`, { profile: { ...FULL_PROFILE, visible: { ...FULL_PROFILE.visible, smoking: "mucho" } } });
  check("an answer the questionnaire doesn't offer is refused", bad.status === 400 && bad.json.error === "invalid_smoking");
  const payment = await api(admin, "PATCH", `/api/admin/clients/${id}`, { payment: { status: "pagado", amountEur: 1950, method: "transferencia", reference: "F-001", paidOn: "2026-10-15" } });
  check("payment recorded by hand", payment.json.client?.payment.status === "pagado" && payment.json.client.payment.reference === "F-001");
  const reread = await api(admin, "GET", `/api/admin/clients/${id}`);
  check("client reads back the same", reread.json.client?.notes === "Muy claro con lo que busca" && reread.json.client.programme === "select");

  // --- Search: 20 km, ranking, everyone eligible -------------------------------------
  const s1 = (await api(admin, "POST", `/api/admin/clients/${id}/search`)).json;
  const byUid = Object.fromEntries(s1.results.map((r) => [r.uid, r]));
  const compatible = s1.results.filter((r) => r.compatible).map((r) => r.uid);
  check("pool excludes unfinished (incl. no photos) and duplicate profiles", !byUid["mm-draft"] && !byUid["mm-dup"] && !byUid["mm-nophotos"]);
  check("misma ciudad: Madrid, Pozuelo (11 km), Las Rozas (17 km) compatible", ["mm-madrid", "mm-pozuelo", "mm-lasrozas"].every((u) => compatible.includes(u)), compatible.join(","));
  check("misma ciudad: Alcalá (28 km) not compatible, reason distance", byUid["mm-alcala"] && !byUid["mm-alcala"].compatible && byUid["mm-alcala"].failures.some((f) => f.reason === "distance"));
  check("distances shown", byUid["mm-pozuelo"].distanceKm > 5 && byUid["mm-pozuelo"].distanceKm < 15, `${byUid["mm-pozuelo"].distanceKm} km`);
  check("age, gender and smoking rules still apply", !byUid["mm-old"].compatible && !byUid["mm-man"].compatible && !byUid["mm-smoker"].compatible);
  const scores = s1.results.filter((r) => r.compatible).map((r) => r.score);
  check("compatible list ranked by score, highest first", scores.every((v, i) => i === 0 || scores[i - 1] >= v), scores.join(","));
  check("every result has score explanation and reciprocity", s1.results.filter((r) => r.compatible).every((r) => r.why && r.why.lines.length > 0 && r.clientAcceptsCandidate && r.candidateAcceptsClient));
  check("no minimum score and no cap: all compatible returned", s1.compatibleCount === compatible.length && s1.compatibleCount >= 5, String(s1.compatibleCount));

  await api(admin, "PATCH", `/api/admin/clients/${id}`, { profile: { ...FULL_PROFILE, dealbreakers: { ...FULL_PROFILE.dealbreakers, maxDistance: "sin_limite" } } });
  const s2 = (await api(admin, "POST", `/api/admin/clients/${id}/search`)).json;
  const by2 = Object.fromEntries(s2.results.map((r) => [r.uid, r]));
  check("national: Valencia, Barcelona, Toledo, Alcalá compatible without a distance limit", ["mm-valencia", "mm-barcelona", "mm-toledo", "mm-alcala"].every((u) => by2[u]?.compatible));
  check(
    "reciprocal: a Valencia candidate who wants misma ciudad rejects a Madrid client",
    by2["mm-valencia-strict"] && !by2["mm-valencia-strict"].compatible && by2["mm-valencia-strict"].clientAcceptsCandidate && !by2["mm-valencia-strict"].candidateAcceptsClient,
  );
  check("Valencia placed as València (alias)", by2["mm-valencia"].place?.name === "València");
  const vil = by2["mm-villanueva"];
  check("ambiguous city flagged with options", vil.location === "ambiguous" && vil.locationOptions.length > 3, `${vil.locationOptions.length} options`);
  const fixLoc = await api(admin, "PUT", "/api/admin/candidate-locations/mm-villanueva", { ine: vil.locationOptions[0].ine });
  const s3 = (await api(admin, "POST", `/api/admin/clients/${id}/search`)).json;
  const vil3 = s3.results.find((r) => r.uid === "mm-villanueva");
  check("team confirms the municipality; the candidate's own text is untouched", fixLoc.status === 200 && vil3.location === "confirmed" && vil3.distanceKm !== null && (await db.doc("profiles/mm-villanueva").get()).get("visible.city") === "Villanueva");

  // --- Candidate detail ------------------------------------------------------------------
  const det = await api(admin, "GET", `/api/admin/clients/${id}/candidates/mm-pozuelo`);
  const d = det.json.candidate;
  check("profile detail: photos, presentation, contact, score", det.status === 200 && d.photos.length === 2 && !!d.presentation && d.contact.email === emailOf("mm-pozuelo") && d.why?.score > 0);
  const raw = JSON.stringify(det.json);
  check("profile detail never includes income or birth date", !raw.includes("40k_80k") && !raw.includes("birthDate") && !raw.includes("incomeRange"));
  check("opening a profile writes nothing", (await countAll("proposals")) === before.proposals);

  // --- Shortlist -----------------------------------------------------------------------------
  const a1 = await api(admin, "POST", `/api/admin/clients/${id}/shortlist`, { candidateUid: "mm-pozuelo", score: by2["mm-pozuelo"].score });
  const a2 = await api(admin, "POST", `/api/admin/clients/${id}/shortlist`, { candidateUid: "mm-pozuelo", score: 10 });
  await api(admin, "POST", `/api/admin/clients/${id}/shortlist`, { candidateUid: "mm-madrid" });
  await api(admin, "POST", `/api/admin/clients/${id}/shortlist`, { candidateUid: "mm-delete-me" });
  await api(admin, "POST", `/api/admin/clients/${id}/shortlist`, { candidateUid: "mm-delete-pre" });
  check("one-click add; adding twice keeps one entry", a1.json.already === false && a2.json.already === true && a1.json.id === a2.json.id);
  const entry = a1.json.id;
  const upd = await api(admin, "PATCH", `/api/admin/clients/${id}/shortlist/${entry}`, { status: "presentado", note: "Le encaja por viajes" });
  await api(admin, "PATCH", `/api/admin/clients/${id}/shortlist/${encodeURIComponent(`${id}_mm-delete-me`)}`, { status: "presentado" });
  const badStatus = await api(admin, "PATCH", `/api/admin/clients/${id}/shortlist/${entry}`, { status: "enviado" });
  check("status and note saved; unknown status refused", upd.status === 200 && badStatus.status === 400);
  const sl = (await api(admin, "GET", `/api/admin/clients/${id}/shortlist`)).json.shortlist;
  check("shortlist reads back with live candidate data", sl.length === 4 && sl.find((e) => e.id === entry)?.note === "Le encaja por viajes" && sl.find((e) => e.id === entry)?.candidate?.firstName === "Marta");
  const list = (await api(admin, "GET", "/api/admin/clients")).json.items.find((i) => i.client.id === id);
  check("client list counts presented against the programme", list.presented === 2 && list.shortlisted === 4, `${list.presented} presented`);
  const s4 = (await api(admin, "POST", `/api/admin/clients/${id}/search`)).json;
  check("search marks people already on the shortlist", s4.results.find((r) => r.uid === "mm-pozuelo").shortlistStatus === "presentado");
  const removed = await api(admin, "DELETE", `/api/admin/clients/${id}/shortlist/${encodeURIComponent(`${id}_mm-madrid`)}`);
  check("remove from shortlist", removed.status === 200 && (await api(admin, "GET", `/api/admin/clients/${id}/shortlist`)).json.shortlist.length === 3);

  // --- Convert a request -------------------------------------------------------------------------
  const conv1 = await api(admin, "POST", "/api/admin/clients", { fromInquiryId: "mm-inq-1" });
  const conv2 = await api(admin, "POST", "/api/admin/clients", { fromInquiryId: "mm-inq-1" });
  const cc = conv1.json.client;
  check("request converted to a client (twice → same client)", conv1.status === 200 && cc.id === conv2.json.client?.id);
  check("request answers carried over", cc.firstName === "Andrés" && cc.programme === "privado" && cc.placeIne === "28115" && cc.profile.dealbreakers.ageMin === 44 && cc.profile.visible.relationshipIntention === "relacion_seria" && cc.notes.includes("viajar"));
  check("request marked as converted", (await db.doc("matchmakingInquiries/mm-inq-1").get()).get("clientId") === cc.id);

  // Changing the status to "Cliente" creates the client record.
  const st = await api(admin, "PATCH", "/api/admin/dashboard/inquiries/mm-inq-2", { status: "cliente" });
  const inq2 = (await db.doc("matchmakingInquiries/mm-inq-2").get()).data();
  const ines = st.json?.clientId ? (await api(admin, "GET", `/api/admin/clients/${st.json.clientId}`)).json.client : null;
  check("status → Cliente creates a real client", st.status === 200 && !!st.json.clientId && ines?.firstName === "Inés" && ines.email === "ines.prueba@example.test", JSON.stringify(st.json));
  check("…linked on the request, which stays for history", inq2.clientId === st.json.clientId && inq2.status === "cliente" && inq2.busca === "Conversación y calma");
  const listed = (await api(admin, "GET", "/api/admin/clients")).json.items.some((i) => i.client.id === st.json.clientId);
  check("…and shows in Clientes straight away", listed);
  const again = await api(admin, "PATCH", "/api/admin/dashboard/inquiries/mm-inq-2", { status: "cliente" });
  check("…setting it again doesn't create a second client", again.json?.clientId === st.json.clientId);
  const back = await api(admin, "PATCH", "/api/admin/dashboard/inquiries/mm-inq-2", { status: "espera" });
  check("a converted request can't silently go back to another status", back.status === 409 && /already_client/.test(back.json?.error ?? ""), `${back.status} ${back.json?.error}`);
  const note = await api(admin, "PATCH", "/api/admin/dashboard/inquiries/mm-inq-2", { note: "Llamada hecha" });
  check("notes on a converted request still save", note.status === 200);
  const dupe = await api(admin, "PATCH", "/api/admin/dashboard/inquiries/mm-inq-3", { status: "cliente" });
  const clientsWithEmail = (await db.collection("clients").where("email", "==", "carlos.prueba@example.test").get()).size;
  check("a request from an existing client's email links to that client", dupe.json?.clientId === id && clientsWithEmail === 1, `${dupe.json?.clientId} vs ${id}, ${clientsWithEmail} record(s)`);

  // --- Clients are candidates for other clients ---------------------------------------------------------
  const elenaId = (await api(admin, "POST", "/api/admin/clients", {})).json.client.id;
  await api(admin, "PATCH", `/api/admin/clients/${elenaId}`, {
    firstName: "Elena", lastName: "Prueba", email: "elena.prueba@example.test", phone: "644444444", channel: "whatsapp",
    ageYears: 50, city: "Madrid", programme: "select", programmeStart: "2026-10-15", status: "activo",
    profile: {
      visible: { ...FULL_PROFILE.visible, gender: "mujer", profession: "Arquitecta", heightCm: 168 },
      incomeRange: "80k_150k",
      dealbreakers: { ...FULL_PROFILE.dealbreakers, gendersSought: ["hombre"], ageMin: 45, ageMax: 60 },
      preferences: { ...FULL_PROFILE.preferences, heightMinCm: 170, heightMaxCm: 195 },
    },
  });
  const sc = (await api(admin, "POST", `/api/admin/clients/${id}/search`)).json;
  const elenaRow = sc.results.find((r) => r.uid === `cliente_${elenaId}`);
  check("another active client appears in the search, marked Cliente", elenaRow?.compatible && elenaRow.type === "cliente", JSON.stringify(elenaRow ?? null).slice(0, 160));
  check("a client never appears in their own search", !sc.results.some((r) => r.uid === `cliente_${id}`));
  check("profiles are marked Perfil privado", sc.results.find((r) => r.uid === "mm-madrid")?.type === "perfil_privado");
  const se = (await api(admin, "POST", `/api/admin/clients/${elenaId}/search`)).json;
  check("…and it works both ways", se.results.find((r) => r.uid === `cliente_${id}`)?.compatible === true);
  const cd = await api(admin, "GET", `/api/admin/clients/${id}/candidates/cliente_${elenaId}`);
  check("client candidate detail: from the ficha, no income", cd.status === 200 && cd.json.candidate.firstName === "Elena" && cd.json.candidate.type === "cliente" && !JSON.stringify(cd.json).includes("80k_150k"));
  const sh = await api(admin, "POST", `/api/admin/clients/${id}/shortlist`, { candidateUid: `cliente_${elenaId}` });
  const shSelf = await api(admin, "POST", `/api/admin/clients/${id}/shortlist`, { candidateUid: `cliente_${id}` });
  const slc = (await api(admin, "GET", `/api/admin/clients/${id}/shortlist`)).json.shortlist;
  check("a client can be preselected for another client, not for themself", sh.status === 200 && shSelf.status !== 200 && slc.some((e) => e.candidateUid === `cliente_${elenaId}` && e.candidate?.firstName === "Elena"));
  await api(admin, "DELETE", `/api/admin/clients/${id}/shortlist/${encodeURIComponent(sh.json.id)}`);
  await api(admin, "PATCH", `/api/admin/clients/${elenaId}`, { status: "en_pausa" });
  const sp = (await api(admin, "POST", `/api/admin/clients/${id}/search`)).json;
  check("a paused client is not proposed", !sp.results.some((r) => r.uid === `cliente_${elenaId}`));

  // --- Candidatos list ------------------------------------------------------------------------------------
  const cand = await api(admin, "GET", "/api/admin/candidates");
  const rows = cand.json?.items ?? [];
  const row = (k) => rows.find((r) => r.key === k);
  check("Candidatos lists private profiles with completeness", row("mm-madrid")?.type === "perfil_privado" && row("mm-madrid").complete === true && row("mm-nophotos")?.complete === false && row("mm-nophotos").missing.includes("fotos"));
  check("Candidatos leaves out confirmed duplicates", !rows.some((r) => r.key === "mm-dup"));
  check("Candidatos lists clients without a profile, typed Cliente", rows.some((r) => r.type === "cliente" && r.firstName === "Inés") && rows.some((r) => r.type === "cliente" && r.firstName === "Carlos"));
  check("Candidatos rows carry no membership fields", !/membership|subscription|stripe/i.test(JSON.stringify(rows)));
  // "Dejar de ser presentada": her own switch keeps her out of every search.
  await db.doc("profiles/mm-lasrozas").update({ "meta.presentationsPaused": true });
  const sPause = (await api(admin, "POST", `/api/admin/clients/${id}/search`)).json;
  const cPause = (await api(admin, "GET", "/api/admin/candidates")).json.items.find((r) => r.key === "mm-lasrozas");
  check("a paused profile is left out of the search", !sPause.results.some((r) => r.uid === "mm-lasrozas"));
  check("…and shows as En pausa in Candidatos", cPause?.paused === true && cPause.complete === true);
  await db.doc("profiles/mm-lasrozas").update({ "meta.presentationsPaused": false });

  // --- Nothing automatic ------------------------------------------------------------------------------
  const secret = process.env.MATCHING_ADMIN_SECRET;
  const due = await fetch(`${APP}/api/admin/matching/run-due-cycle`, { method: "POST", headers: { "x-admin-secret": secret } });
  const dueJson = await due.json().catch(() => ({}));
  const cycle = await fetch(`${APP}/api/admin/matching/run-cycle`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-secret": secret },
    body: JSON.stringify({ cycleId: "mm-test-cycle", mode: "production" }),
  });
  const cycleJson = await cycle.json().catch(() => ({}));
  check("automatic matching scan runs but does nothing", due.status === 200 && dueJson.ok, JSON.stringify(dueJson).slice(0, 160));
  check("automatic matching cycle refuses to run", cycle.status === 409 && cycleJson.error === "automatic_introductions_disabled", `${cycle.status} ${cycleJson.error || ""}`);
  const memberTok = await tokenForEmail(emailOf("mm-madrid"), "mm-madrid");
  const decide = await api(memberTok, "POST", "/api/member/proposals/any/decide", { decision: "accept" });
  check("members can't act on old proposals (410)", decide.status === 410, String(decide.status));
  const after = {
    proposals: await countAll("proposals"),
    invitations: await countAll("invitations"),
    introductions: await countAll("introductions"),
    outboundEmails: await countAll("outboundEmails"),
    pairHistory: await countAll("pairHistory"),
  };
  check("no proposals, invitations, introductions or pair history created", ["proposals", "invitations", "introductions", "pairHistory"].every((k) => after[k] === before[k]), JSON.stringify(after));
  check("no emails queued by the client work", after.outboundEmails === before.outboundEmails);

  // --- Candidate edits own profile; identity fields locked ----------------------------------------------
  const docUrl = (uid, mask) => `${FS_EMU}/v1/projects/${project}/databases/(default)/documents/profiles/${uid}?updateMask.fieldPaths=${mask}`;
  const edit = await fetch(docUrl("mm-madrid", "visible.profession"), {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${memberTok}` },
    body: JSON.stringify({ fields: { visible: { mapValue: { fields: { profession: { stringValue: "Médica" } } } } } }),
  });
  check("candidate can edit their own profile", edit.status === 200, String(edit.status));
  const dupTok = await tokenForEmail(emailOf("mm-dup"), "mm-dup");
  const sneak = await fetch(docUrl("mm-dup", "meta.duplicateStatus"), {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${dupTok}` },
    body: JSON.stringify({ fields: { meta: { mapValue: { fields: { duplicateStatus: { stringValue: "clear" } } } } } }),
  });
  check("candidate can't clear their own duplicate status", sneak.status === 403, String(sneak.status));
  const s5 = (await api(admin, "POST", `/api/admin/clients/${id}/search`)).json;
  check("edited profile shows in search straight away", s5.results.find((r) => r.uid === "mm-madrid") !== undefined);

  // --- Deletion -------------------------------------------------------------------------------------------
  const delTok = await tokenForEmail(emailOf("mm-delete-me"), "mm-delete-me");
  const delPreTok = await tokenForEmail(emailOf("mm-delete-pre"), "mm-delete-pre");
  const del1 = await api(delTok, "POST", "/api/member/delete-profile", {});
  const del2 = await api(delPreTok, "POST", "/api/member/delete-profile", {});
  check("candidates delete their profiles", del1.status === 200 && del2.status === 200, `${del1.status} ${del2.status}`);
  const s6 = (await api(admin, "POST", `/api/admin/clients/${id}/search`)).json;
  check("deleted candidates disappear from results", !s6.results.some((r) => r.uid === "mm-delete-me" || r.uid === "mm-delete-pre"));
  const sl2 = (await api(admin, "GET", `/api/admin/clients/${id}/shortlist`)).json.shortlist;
  check("deleted candidates disappear from the shortlist", !sl2.some((e) => e.candidateUid === "mm-delete-me" || e.candidateUid === "mm-delete-pre"));
  check("a presented-then-deleted person still counts, anonymously", sl2.filter((e) => e.deletedCandidate && e.status === "presentado" && e.candidate === null).length === 1 && JSON.stringify(sl2).indexOf("Beatriz") === -1);
  const stored = await db.collection("clientShortlist").where("clientId", "==", id).get();
  check("no personal trace of the deleted person in shortlist records", !stored.docs.some((x) => ["mm-delete-me", "mm-delete-pre"].includes(x.get("candidateUid")) || x.get("personId") === "mm-delete-me"));

  // --- Reconnect still works -------------------------------------------------------------------------------
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(Date.now() - 86400000));
  await db.doc(`eligibleTicketTailorEvents/${EVENT_ID}`).set({
    ticketTailorEventId: EVENT_ID, label: "Cena de prueba", eventDate: yesterday, active: true, memberBenefitEnabled: false,
    reconnectEnabled: true, reconnectForceClosedAt: null, createdAt: ts("2026-10-01T10:00:00Z"), updatedAt: ts("2026-10-01T10:00:00Z"),
  });
  const pid = (email) => `${EVENT_ID}_${crypto.createHash("sha256").update(email).digest("hex").slice(0, 32)}`;
  for (const [uid, first] of [["mm-man", "Javier"], ["mm-madrid", "Lucía"]]) {
    await db.doc(`eventParticipants/${pid(emailOf(uid))}`).set({
      eventId: EVENT_ID, normalizedEmail: emailOf(uid), firstName: first, lastName: null, phone: null, ticketTailorOrderId: null,
      status: "imported", claimedUid: null, claimedPersonId: null, collisionUid: null, visibleForReconnect: false,
      acceptsConnectionRequests: false, activatedAt: null, invitationEmailSentAt: null, requestsSent: 0,
      importedAt: ts("2026-10-14T10:00:00Z"), claimedAt: null, optedOutAt: null, updatedAt: ts("2026-10-14T10:00:00Z"),
    });
  }
  const manTok = await tokenForEmail(emailOf("mm-man"), "mm-man");
  const active = await api(manTok, "GET", "/api/member/reconnect/active");
  check("Reconnect: open event found for a participant", active.json.event?.eventId === EVENT_ID, JSON.stringify(active.json));
  const actA = await api(manTok, "POST", "/api/member/reconnect/activate", { eventId: EVENT_ID, firstName: "Javier", showPhotoInReconnect: false, contactMethod: "whatsapp", contactValue: "600000001" });
  const actB = await api(memberTok, "POST", "/api/member/reconnect/activate", { eventId: EVENT_ID, firstName: "Lucía", showPhotoInReconnect: false, contactMethod: "whatsapp", contactValue: "600000002" });
  check("Reconnect: both participants activate", actA.status === 200 && actB.status === 200, `${actA.status} ${JSON.stringify(actA.json)} ${actB.status}`);
  const found = await api(manTok, "GET", `/api/member/reconnect/${EVENT_ID}/search?name=Luc`);
  const target = (found.json.results || []).find((r) => r.firstName === "Lucía");
  check("Reconnect: search by name finds the other participant", !!target, JSON.stringify(found.json).slice(0, 160));
  const req = await api(manTok, "POST", `/api/member/reconnect/${EVENT_ID}/request`, { targetParticipantId: target?.participantId });
  check("Reconnect: request sent", req.status === 200, JSON.stringify(req.json));
  const reqDoc = (await db.collection("eventReconnectRequests").where("eventId", "==", EVENT_ID).get()).docs[0];
  const acc = await api(memberTok, "POST", `/api/member/reconnect/requests/${reqDoc?.id}/decide`, { decision: "accept" });
  check("Reconnect: request accepted", acc.status === 200 && acc.json.status === "accepted", JSON.stringify(acc.json));

  await cleanup();
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} of ${results.length} FAILED` : `\nAll ${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
