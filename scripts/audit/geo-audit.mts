// READ-ONLY audit: city registration and geographic matching. Counts how
// cities are stored and resolved across profiles, clients, community
// registrations and matchmaking requests, and how many complete candidates
// sit outside Madrid. Writes nothing: every Firestore write method is
// replaced by one that throws, and the credentials must be the read-only
// audit service account.
//
//   npx tsx --conditions=react-server scripts/audit/geo-audit.mts
//
// Output: counts and city texts only. No names, emails or uids.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// AUDIT_EMULATOR_HOST: test the script against a local Firestore emulator instead.
const EMULATOR = process.env.AUDIT_EMULATOR_HOST ?? null;
const PROJECT = EMULATOR ? "demo-junto-select" : "select-dev-508407";
const SA = process.env.AUDIT_SA ?? `claude-readonly-audit@${PROJECT}.iam.gserviceaccount.com`;

// --- Credentials: impersonate the read-only account for this process only ----
const adcPath = join(homedir(), ".config/gcloud/application_default_credentials.json");
const adc = EMULATOR
  ? { type: "emulator" }
  : (JSON.parse(readFileSync(adcPath, "utf8")) as Record<string, unknown>);
let credsFile = "";
let credsDir: string | null = null;
if (adc.type === "impersonated_service_account") {
  if (!String(adc.service_account_impersonation_url).includes(SA)) {
    console.error(`ADC already impersonates another account, not ${SA}. Stopping.`);
    process.exit(1);
  }
  credsFile = adcPath;
} else if (adc.type === "authorized_user") {
  credsDir = mkdtempSync(join(tmpdir(), "junto-audit-"));
  credsFile = join(credsDir, "impersonated.json");
  writeFileSync(
    credsFile,
    JSON.stringify({
      type: "impersonated_service_account",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SA}:generateAccessToken`,
      source_credentials: adc,
      delegates: [],
    }),
    { mode: 0o600 },
  );
} else if (!EMULATOR) {
  console.error(`Unexpected ADC type "${String(adc.type)}". Stopping rather than guessing.`);
  process.exit(1);
}
process.on("exit", () => {
  if (credsDir) rmSync(credsDir, { recursive: true, force: true });
});
if (EMULATOR) process.env.FIRESTORE_EMULATOR_HOST = EMULATOR;
else {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credsFile;
  delete process.env.FIRESTORE_EMULATOR_HOST;
}
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.GCLOUD_PROJECT = PROJECT;

// --- Write guard: refuse every write before anything is loaded ---------------
const fs = await import("firebase-admin/firestore");
const refuse = (what: string) =>
  function () {
    throw new Error(`READ-ONLY AUDIT: refused ${what}`);
  };
for (const m of ["set", "update", "delete", "create"]) {
  (fs.DocumentReference.prototype as unknown as Record<string, unknown>)[m] = refuse(`DocumentReference.${m}`);
  (fs.WriteBatch.prototype as unknown as Record<string, unknown>)[m] = refuse(`WriteBatch.${m}`);
}
(fs.WriteBatch.prototype as unknown as Record<string, unknown>).commit = refuse("WriteBatch.commit");
(fs.CollectionReference.prototype as unknown as Record<string, unknown>).add = refuse("CollectionReference.add");
(fs.Firestore.prototype as unknown as Record<string, unknown>).runTransaction = refuse("runTransaction");
(fs.Firestore.prototype as unknown as Record<string, unknown>).bulkWriter = refuse("bulkWriter");
(fs.Firestore.prototype as unknown as Record<string, unknown>).batch = refuse("batch");



const { adminDb } = await import("../../src/lib/firebase/admin");
const { loadClients, loadPoolProfiles } = await import("../../src/lib/clients/candidatePool");
const { loadConfirmedPlaces } = await import("../../src/lib/clients/locations");
const { attachConfirmedPlace, resolveProfileLocation } = await import("../../src/lib/geo/profileLocation");
const { distanceKm, getPlace, resolveCity, SAME_CITY_RADIUS_KM } = await import("../../src/lib/geo/places");
const { isProfileInEligiblePool } = await import("../../src/lib/matching/eligibility");

type Any = Record<string, unknown>;
const tally = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const show = (m: Map<string, number>) =>
  m.size === 0 ? "    (none)" : [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `    ${v}  ${k}`).join("\n");
const placeNamed = (name: string) => {
  const r = resolveCity(name);
  if (r.status !== "resolved") throw new Error(`hub ${name} not resolved`);
  return r.place;
};
const HUBS = { Madrid: placeNamed("Madrid"), Barcelona: placeNamed("Barcelona"), "València": placeNamed("Valencia"), "Málaga": placeNamed("Málaga") };
const hubOf = (p: { lat: number; lng: number } | null) => {
  if (!p) return "sin ubicar";
  for (const [name, hub] of Object.entries(HUBS)) {
    const d = distanceKm(p, hub);
    if (d <= SAME_CITY_RADIUS_KM) return `${name} (≤20 km)`;
    if (d <= 50) return `${name} (20–50 km)`;
  }
  return "otra zona";
};

console.log(`READ-ONLY geo audit · project ${PROJECT} · as ${SA} · ${new Date().toISOString()}`);

// --- 1. Candidate profiles ----------------------------------------------------
const clients = await loadClients();
const pool = await loadPoolProfiles(clients);
const confirmed = await loadConfirmedPlaces();
for (const p of pool) {
  const c = confirmed.get(p.uid);
  if (c && c.cityText === p.profile.visible.city) attachConfirmedPlace(p.profile, c.place);
}
console.log(`\n== 1. Profiles: ${pool.length} people (one per person, confirmed duplicates left out) ==`);
console.log(`  complete (can appear in "Buscar perfiles compatibles"): ${pool.filter((p) => p.complete).length}`);
console.log(`  complete and searchable now (not paused, not suspected duplicate): ${pool.filter((p) => p.complete && !p.paused && !p.suspectedDuplicate).length}`);
console.log(`  candidateLocations (team-confirmed municipalities): ${confirmed.size}`);

const rawCity = new Map<string, number>();
const status = new Map<string, number>();
const unresolved = new Map<string, number>();
const zoneAll = new Map<string, number>();
const zoneSearchable = new Map<string, number>();
const zoneByGender = new Map<string, number>();
const market = new Map<string, number>();
const marketAll = new Map<string, number>();
const distance = new Map<string, number>();
const notEligibleBadge = new Map<string, number>();
const viaMap = new Map<string, number>();
for (const p of pool) {
  const v = p.profile.visible;
  const searchable = p.complete && !p.paused && !p.suspectedDuplicate;
  tally(rawCity, JSON.stringify(v.city ?? ""));
  const loc = resolveProfileLocation(p.profile);
  tally(status, loc.status);
  if (loc.status === "resolved") tally(viaMap, loc.via);
  if (loc.status !== "resolved") tally(unresolved, `${JSON.stringify(v.city ?? "")} -> ${loc.status}${"options" in loc && loc.options.length ? ` (${loc.options.slice(0, 3).map((o) => `${o.name}/${o.province}`).join("; ")})` : ""}`);
  const place = loc.status === "resolved" ? loc.place : null;
  const zone = place ? `${hubOf(place)}${hubOf(place) === "otra zona" ? ` · ${place.province}` : ""}` : "sin ubicar";
  tally(zoneAll, zone);
  tally(marketAll, `${zone.startsWith("Madrid") ? "zona Madrid" : zone === "sin ubicar" ? "sin ubicar" : "fuera de Madrid"} · ${v.marketAvailability ?? "null"} · ${p.complete ? "completo" : "incompleto"}`);
  if (searchable) {
    tally(zoneSearchable, zone);
    tally(zoneByGender, `${v.gender ?? "?"} · ${zone}`);
    tally(market, `${zone.startsWith("Madrid") ? "zona Madrid" : "fuera de Madrid"} · ${v.marketAvailability ?? "null"}`);
    tally(distance, `${v.gender ?? "?"} · ${zone.startsWith("Madrid") ? "zona Madrid" : "fuera de Madrid"} · ${p.profile.dealbreakers.maxDistance ?? "null"}`);
    if (!isProfileInEligiblePool(p.profile)) tally(notEligibleBadge, `${zone} · market=${v.market} · availability=${v.marketAvailability ?? "null"}`);
  }
}
console.log(`\n  Raw city text as typed (all ${pool.length}):\n${show(rawCity)}`);
console.log(`\n  How the city resolves:\n${show(status)}\n  resolved via:\n${show(viaMap)}`);
console.log(`\n  Not placed automatically:\n${show(unresolved)}`);
console.log(`\n  Zone, all profiles:\n${show(zoneAll)}`);
console.log(`\n  Zone, searchable profiles:\n${show(zoneSearchable)}`);
console.log(`\n  Gender × zone, searchable:\n${show(zoneByGender)}`);
console.log(`\n  "¿Cuál es tu relación con Madrid?" × zone, searchable:\n${show(market)}`);
console.log(`\n  "¿Cuál es tu relación con Madrid?" × zone × complete, all profiles:\n${show(marketAll)}`);
console.log(`\n  "Distancia máxima" × gender × zone, searchable:\n${show(distance)}`);
console.log(`\n  Searchable but shown "No elegible" on the admin profile page (Madrid gate):\n${show(notEligibleBadge)}`);

// --- 2. Clients -----------------------------------------------------------------
console.log(`\n== 2. Clients: ${clients.length} ==`);
const cl = new Map<string, number>();
for (const c of clients) {
  const place = getPlace(c.placeIne);
  tally(cl, `status=${c.status} · programme=${c.programme ?? "null"} · city=${JSON.stringify(c.city)} · placeIne=${place ? `${place.name}/${place.province}` : "null"} · maxDistance=${c.profile.dealbreakers.maxDistance ?? "null"}`);
}
console.log(show(cl));

// --- 3. Community registrations (/unete, Brevo) ----------------------------------
const inv = await adminDb.collection("invitationRequests").get();
const invCity = new Map<string, number>();
const invOther = new Map<string, number>();
for (const d of inv.docs) {
  tally(invCity, String(d.get("ciudad") ?? "null"));
  if (d.get("ciudad") === "otra") tally(invOther, JSON.stringify(d.get("ciudadOtra") ?? null));
}
console.log(`\n== 3. invitationRequests: ${inv.size} ==\n  ciudad:\n${show(invCity)}\n  ciudadOtra texts:\n${show(invOther)}`);

// --- 4. Matchmaking requests (/matchmaking form) ---------------------------------
const inq = await adminDb.collection("matchmakingInquiries").get();
const inqCity = new Map<string, number>();
for (const d of inq.docs) {
  const t = String(d.get("ciudad") ?? "");
  const r = resolveCity(t);
  tally(inqCity, `${JSON.stringify(t)} -> ${r.status === "resolved" ? `${r.place.name}/${r.place.province}` : r.status}`);
}
console.log(`\n== 4. matchmakingInquiries: ${inq.size} ==\n${show(inqCity)}`);

// --- 5. Location-only reach from each hub ----------------------------------------
// For a hypothetical client living in each city: how many searchable women and
// men are within 20 km, and how many of those would themselves accept only
// "misma ciudad". Other filters (age, intention, smoking, children) are not applied.
console.log(`\n== 5. Searchable profiles within ${SAME_CITY_RADIUS_KM} km / 50 km of each city ==`);
for (const [name, hub] of Object.entries(HUBS)) {
  for (const g of ["mujer", "hombre"]) {
    const s = pool.filter((p) => p.complete && !p.paused && !p.suspectedDuplicate && p.profile.visible.gender === g);
    const placed = s.map((p) => ({ p, loc: resolveProfileLocation(p.profile) }));
    const near = placed.filter(({ loc }) => loc.status === "resolved" && distanceKm(loc.place, hub) <= SAME_CITY_RADIUS_KM);
    const mid = placed.filter(({ loc }) => loc.status === "resolved" && distanceKm(loc.place, hub) <= 50);
    const outsideSinLimite = placed.filter(({ p, loc }) => !(loc.status === "resolved" && distanceKm(loc.place, hub) <= SAME_CITY_RADIUS_KM) && p.profile.dealbreakers.maxDistance === "sin_limite");
    console.log(`  ${name} · ${g}: ≤20 km ${near.length} (of which misma_ciudad ${near.filter(({ p }) => p.profile.dealbreakers.maxDistance === "misma_ciudad").length}) · ≤50 km ${mid.length} · farther but "sin límite" ${outsideSinLimite.length}`);
  }
}
console.log("\nDone. Nothing was written.");
