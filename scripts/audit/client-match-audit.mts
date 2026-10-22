// READ-ONLY audit: why does one client's "Buscar perfiles compatibles" come back
// empty? Runs the admin's own search (src/lib/clients/search.ts) for the client,
// then rebuilds the candidate funnel stage by stage, so every exclusion has a
// count and a reason. Writes nothing: every Firestore write method is replaced
// by one that throws before any data is loaded, and the credentials must be the
// read-only audit service account (Datastore Viewer).
//
//   AUDIT_CLIENT="jose francisco" npx tsx --conditions=react-server scripts/audit/client-match-audit.mts
//
// Credentials: the user's own ADC (~/.config/gcloud/application_default_credentials.json,
// from `gcloud auth application-default login`) is wrapped, for this process
// only, in an impersonation of AUDIT_SA (default claude-readonly-audit). Nothing
// global is changed. Output: ids, initials, ages, municipalities and filter
// results only; never an email, phone, surname or photo.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// AUDIT_EMULATOR_HOST: test the script against a local Firestore emulator instead.
const EMULATOR = process.env.AUDIT_EMULATOR_HOST ?? null;
const PROJECT = EMULATOR ? "demo-junto-select" : "select-dev-508407";
const SA = process.env.AUDIT_SA ?? `claude-readonly-audit@${PROJECT}.iam.gserviceaccount.com`;
const QUERY = (process.env.AUDIT_CLIENT ?? "jose francisco").trim();

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
const { searchForClient } = await import("../../src/lib/clients/search");
const { loadClients, loadPoolProfiles, profileAge, clientAge, clientIsAvailableCandidate, clientCandidateUid } =
  await import("../../src/lib/clients/candidatePool");
const { clientAsProfile } = await import("../../src/lib/clients/matchProfile");
const { missingForSearch } = await import("../../src/lib/clients/types");
const { evaluateHardFiltersDetailed } = await import("../../src/lib/matching/hardFilters");
const { resolveProfileLocation } = await import("../../src/lib/geo/profileLocation");
const { distanceKm, getPlace, resolveCity } = await import("../../src/lib/geo/places");
const { loadConfirmedPlaces } = await import("../../src/lib/clients/locations");
const { attachConfirmedPlace, placeOfProfile } = await import("../../src/lib/geo/profileLocation");

type Any = Record<string, unknown>;
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
const initial = (s: string) => (s.trim()[0] ?? "?").toUpperCase() + ".";
const typeOf = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const tally = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const show = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `    ${v}  ${k}`).join("\n");

console.log(`READ-ONLY audit · project ${PROJECT} · as ${SA} · ${new Date().toISOString()}`);

// --- 1. Identify the client ---------------------------------------------------
const clientsSnap = await adminDb.collection("clients").get();
const words = norm(QUERY).split(/\s+/);
const looks = (first: string, last: string) => {
  const n = norm(`${first} ${last}`);
  return { all: words.every((w) => n.includes(w)), any: words.some((w) => n.split(/\s+/).includes(w)) };
};
console.log(`\n== 1. Clients (${clientsSnap.size} in total) matching "${QUERY}" ==`);
const strong: string[] = [];
for (const d of clientsSnap.docs) {
  const first = String(d.get("firstName") ?? "");
  const last = String(d.get("lastName") ?? "");
  const m = looks(first, last);
  if (!m.any) continue;
  if (m.all) strong.push(d.id);
  console.log(
    `  ${m.all ? "MATCH  " : "similar"} id=${d.id} name="${first} ${initial(last)}" status=${d.get("status")} programme=${d.get("programme")} created=${d.get("createdAt")?.toDate?.().toISOString?.().slice(0, 10)} inquiry=${d.get("inquiryId") ? "yes" : "no"}`,
  );
}
// Also a private profile with the same name (he might be in the pool too).
const profilesSnap = await adminDb.collection("profiles").get();
for (const d of profilesSnap.docs) {
  const first = String((d.get("visible") as Any | undefined)?.firstName ?? "");
  if (looks(first, "").all) console.log(`  profile with that first name: uid=${d.id.slice(0, 8)}… gender=${(d.get("visible") as Any)?.gender}`);
}
if (strong.length === 0) {
  console.log("  No client matches every word. Stopping.");
  process.exit(0);
}

const allClients = await loadClients();
const pool = await loadPoolProfiles(allClients);
const confirmed = await loadConfirmedPlaces();

for (const clientId of strong) {
  const client = allClients.find((c) => c.id === clientId)!;
  const raw = clientsSnap.docs.find((d) => d.id === clientId)!.data() as Any;
  const rawProfile = (raw.profile ?? {}) as Any;
  console.log(`\n\n######## Client ${clientId} (${client.firstName} ${initial(client.lastName)}) ########`);

  // --- 2. Criteria as stored, and as the search reads them --------------------
  console.log("\n== 2. Saved criteria ==");
  const v = client.profile.visible;
  const db = client.profile.dealbreakers;
  const clientPlace = getPlace(client.placeIne);
  const res = client.placeIne ? null : resolveCity(client.city);
  console.log(`  status=${client.status} programme=${client.programme} start=${client.programmeStart} end=${client.programmeEnd} payment=${client.payment.status}`);
  console.log(`  age=${client.ageYears} (recorded ${client.ageRecordedOn}; as used today: ${clientAge(client)})`);
  console.log(`  city="${client.city}" placeIne=${client.placeIne} → ${clientPlace ? `${clientPlace.name} (${clientPlace.province})` : `not placed (${res?.status}${res && "options" in res ? `: ${res.options.slice(0, 5).map((o) => o.name + "/" + o.province).join(", ")}` : ""})`}`);
  console.log(`  self: gender=${v.gender} hasChildren=${v.hasChildren} hasYoungChildren=${v.hasYoungChildren} intention=${v.relationshipIntention} smoking=${v.smoking} wantsFutureChildren=${v.wantsFutureChildren} drinking=${v.drinking} activity=${v.activityLevel} heightCm=${v.heightCm}`);
  console.log(`  seeks (hard): genders=${JSON.stringify(db.gendersSought)} age=${db.ageMin}–${db.ageMax} distance=${db.maxDistance} intentions=${JSON.stringify(db.relationshipIntentionsAccepted)} smokingAccepted=${JSON.stringify(db.smokingAccepted)} youngChildrenMatters=${db.partnerYoungChildrenMatters}`);
  console.log(`  seeks (soft): ${JSON.stringify(client.profile.preferences)}`);
  console.log(`  missingForSearch: ${JSON.stringify(missingForSearch(client))}`);
  console.log(`  free-text dealbreakers notes (${client.dealbreakersNotes.length} chars): ${JSON.stringify(client.dealbreakersNotes)}`);
  console.log(`  free-text values/interests (${client.valuesInterests.length} chars)`);
  // Raw storage types: a value saved as the wrong type is read through a cast, not validated.
  const rawDb = (rawProfile.dealbreakers ?? {}) as Any;
  const rawVis = (rawProfile.visible ?? {}) as Any;
  console.log(
    `  raw types: ageYears=${typeOf(raw.ageYears)} placeIne=${typeOf(raw.placeIne)} gender=${typeOf(rawVis.gender)} gendersSought=${typeOf(rawDb.gendersSought)} ageMin=${typeOf(rawDb.ageMin)} ageMax=${typeOf(rawDb.ageMax)} maxDistance=${typeOf(rawDb.maxDistance)} intentions=${typeOf(rawDb.relationshipIntentionsAccepted)} smokingAccepted=${typeOf(rawDb.smokingAccepted)} youngChildrenMatters=${typeOf(rawDb.partnerYoungChildrenMatters)}`,
  );
  console.log(`  raw top-level keys: ${Object.keys(raw).sort().join(", ")}`);
  console.log(`  raw profile keys: ${Object.keys(rawProfile).sort().join(", ")} · dealbreakers keys: ${Object.keys(rawDb).sort().join(", ")}`);

  // --- 3a. The admin's own search, exactly as the page calls it ---------------
  console.log("\n== 3a. searchForClient (the admin's own code) ==");
  const search = await searchForClient(client);
  console.log(`  missing=${JSON.stringify(search.missing)} clientLocation=${search.clientLocation} clientPlace=${search.clientPlace?.name ?? "none"}`);
  console.log(`  poolSize=${search.poolSize} compatibleCount=${search.compatibleCount}`);
  const defaultZone = client.programme === "privado" ? "espana" : "50";
  const zoneOf = (r: { place: unknown; distanceKm: number | null }, zone: string): boolean | null => {
    if (zone === "espana") return true;
    if (!r.place || !search.clientPlace) return null;
    return r.distanceKm !== null && r.distanceKm <= Number(zone);
  };
  for (const zone of ["20", "50", "100", "espana"]) {
    const comp = search.results.filter((r) => r.compatible);
    const inZ = comp.filter((r) => zoneOf(r, zone) === true).length;
    const unplaced = comp.filter((r) => zoneOf(r, zone) === null).length;
    console.log(`  zone ${zone}${zone === defaultZone ? " (page default)" : ""}: ${inZ} compatible shown, ${unplaced} compatible hidden as "sin ubicación confirmada"`);
  }

  // --- 3b. The funnel, for women ---------------------------------------------
  console.log("\n== 3b. Funnel (women) ==");
  const genderCount = new Map<string, number>();
  for (const d of profilesSnap.docs) tally(genderCount, String((d.get("visible") as Any | undefined)?.gender ?? "null"));
  console.log(`  profiles documents: ${profilesSnap.size} · by gender:\n${show(genderCount)}`);
  const womenDocs = profilesSnap.docs.filter((d) => (d.get("visible") as Any | undefined)?.gender === "mujer");
  const confirmedDup = womenDocs.filter((d) => (d.get("meta") as Any | undefined)?.duplicateStatus === "confirmed_duplicate").length;
  const women = pool.filter((p) => p.profile.visible.gender === "mujer");
  console.log(`  A. women profile documents: ${womenDocs.length}`);
  console.log(`  B. minus confirmed duplicates: −${confirmedDup}`);
  console.log(`  C. one per real person: ${women.length}`);
  const incomplete = women.filter((p) => !p.complete);
  const why = new Map<string, number>();
  incomplete.forEach((p) => tally(why, p.missing.join(" + ")));
  console.log(`  D. incomplete (not proposable): −${incomplete.length}\n${show(why)}`);
  const complete = women.filter((p) => p.complete);
  const susp = complete.filter((p) => p.suspectedDuplicate).length;
  const paused = complete.filter((p) => !p.suspectedDuplicate && p.paused).length;
  console.log(`  E. complete: ${complete.length} · suspected duplicate −${susp} · paused −${paused}`);
  const clientWomen = allClients.filter((c) => c.id !== client.id && c.profile.visible.gender === "mujer");
  const clientWomenAvail = clientWomen.filter((c) => clientIsAvailableCandidate(c) && !pool.some((p) => p.clientId === c.id));
  console.log(`  F. women clients: ${clientWomen.length} · available as candidates (activo + full ficha, no profile): ${clientWomenAvail.length}`);
  const inSearch = search.results.filter((r) => {
    if (r.type === "cliente" && r.uid.startsWith("cliente_")) return clientWomenAvail.some((c) => clientCandidateUid(c.id) === r.uid);
    return pool.find((p) => p.uid === r.uid)?.profile.visible.gender === "mujer";
  });
  console.log(`  G. women in the search pool: ${inSearch.length} (of poolSize ${search.poolSize})`);

  const firstFail = new Map<string, number>();
  const anyFail = new Map<string, number>();
  for (const r of inSearch) {
    if (r.failures.length === 0) continue;
    const f = r.failures[0];
    tally(firstFail, `${f.reason} · ${f.direction === "a_rejects_b" ? "his requirement" : "her requirement"}`);
    for (const g of r.failures) tally(anyFail, `${g.reason} · ${g.direction === "a_rejects_b" ? "his requirement" : "her requirement"}`);
  }
  console.log(`  H. hard filters: ${inSearch.filter((r) => r.compatible).length} pass both directions, ${inSearch.filter((r) => !r.compatible).length} fail`);
  console.log(`     first failing check:\n${show(firstFail)}`);
  console.log(`     every failing check (a woman can fail several):\n${show(anyFail)}`);
  const single = inSearch.filter((r) => r.failures.length === 1);
  console.log(`     failing exactly one check: ${single.length}`);

  // --- 4. Every woman, one line each ----------------------------------------
  console.log("\n== 4. Each woman (pool and excluded) ==");
  const me = clientAsProfile(client);
  // Distance from the saved municipality, or else from the typed city the way the hard filters place it.
  const herePlace = clientPlace ?? placeOfProfile(me);
  console.log(`  distances measured from: ${herePlace ? `${herePlace.name}/${herePlace.province}${clientPlace ? "" : " (typed city; no municipality saved)"}` : "nowhere (client city not placeable)"}`);
  let i = 0;
  const line = (label: string, p: Parameters<typeof resolveProfileLocation>[0], age: number | null, failures: { reason: string; direction: string }[], extra: string) => {
    const loc = resolveProfileLocation(p);
    const place = loc.status === "resolved" ? loc.place : null;
    const km = place && herePlace ? Math.round(distanceKm(place, herePlace)) : null;
    const d = p.dealbreakers;
    console.log(
      `  W${String(++i).padStart(2, "0")} ${label} ${initial(p.visible.firstName)} age=${age} ${place ? `${place.name}/${place.province}` : `"${p.visible.city}"(${loc.status})`} km=${km} · she seeks ${JSON.stringify(d.gendersSought)} ${d.ageMin}–${d.ageMax} ${d.maxDistance} int=${JSON.stringify(d.relationshipIntentionsAccepted)} smk=${JSON.stringify(d.smokingAccepted)} yc=${d.partnerYoungChildrenMatters} · self int=${p.visible.relationshipIntention} smk=${p.visible.smoking} yc=${p.visible.hasYoungChildren} · fails=[${failures.map((f) => `${f.reason}/${f.direction === "a_rejects_b" ? "his" : "hers"}`).join(", ")}] ${extra}`,
    );
  };
  for (const r of inSearch) {
    const p = pool.find((x) => x.uid === r.uid)?.profile ?? clientAsProfile(allClients.find((c) => clientCandidateUid(c.id) === r.uid)!);
    line(r.type === "cliente" ? "[pool, client]" : "[pool]", p, r.age, r.failures, r.compatible ? `score=${r.score}` : "");
  }
  for (const p of women.filter((x) => !inSearch.some((r) => r.uid === x.uid))) {
    const c = confirmed.get(p.uid);
    if (c && c.cityText === p.profile.visible.city) attachConfirmedPlace(p.profile, c.place);
    const reason = !p.complete ? `incomplete: ${p.missing.join(" + ")}` : p.suspectedDuplicate ? "suspected duplicate" : p.paused ? "paused" : "own record";
    line("[excluded]", p.profile, profileAge(p.profile), evaluateHardFiltersDetailed(me, p.profile), `· ${reason} · status=${p.profile.meta.profileStatus} search=${p.profile.meta.searchStatus}`);
  }
}
console.log("\nDone. Nothing was written.");
process.exit(0);
