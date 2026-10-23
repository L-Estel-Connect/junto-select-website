// READ-ONLY audit: where does a member's private.birthDate come from? Reads the
// account(s) for one email (users, profiles, clients, inquiries, events, legacy
// imports) and checks the whole profiles collection for a shared/default date.
// Writes nothing: every Firestore write method is replaced by one that throws,
// and the credentials must be the read-only audit service account.
//
//   AUDIT_EMAIL="lara.dewavrin@gmail.com" npx tsx --conditions=react-server scripts/audit/birthdate-audit.mts
//
// Output: the audited person's own fields; for everyone else, counts only.
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
const { aboutMeSteps } = await import("../../src/lib/introduction/aboutMeFields");

type Any = Record<string, unknown>;
const EMAIL = (process.env.AUDIT_EMAIL ?? "lara.dewavrin@gmail.com").trim();
const iso = (v: unknown) => {
  const d = (v as { toDate?: () => Date })?.toDate?.();
  return d instanceof Date ? d.toISOString() : v === undefined ? "missing" : JSON.stringify(v);
};
const madrid = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
const utcLabel = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const tally = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const show = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `    ${v}  ${k}`).join("\n");
/** Field names that could carry an age or birth date, anywhere in a record. */
const ageish = (obj: unknown, prefix = ""): string[] => {
  if (!obj || typeof obj !== "object") return [];
  if (typeof (obj as { toDate?: unknown }).toDate === "function") return [];
  return Object.entries(obj as Any).flatMap(([k, v]) => {
    const p = prefix ? `${prefix}.${k}` : k;
    const hit = /birth|naci|edad|^age|ageYears|ageRecorded|anio|year/i.test(k) ? [`${p} = ${iso(v)}`] : [];
    return [...hit, ...ageish(v, p)];
  });
};

console.log(`READ-ONLY audit · project ${PROJECT} · as ${SA} · ${new Date().toISOString()}`);
console.log(`Email under audit: ${EMAIL}`);

// --- 1. Accounts with this email --------------------------------------------
const variants = [...new Set([EMAIL, EMAIL.toLowerCase()])];
const userDocs = (await Promise.all(variants.map((v) => adminDb.collection("users").where("email", "==", v).get()))).flatMap((s) => s.docs);
console.log(`\n== 1. users/{uid} with this email: ${userDocs.length} ==`);
for (const u of userDocs) {
  console.log(`  uid=${u.id} createdAt=${iso(u.get("createdAt"))} updatedAt=${iso(u.get("updatedAt"))} keys=[${Object.keys(u.data()).sort().join(", ")}]`);
  const a = ageish(u.data());
  if (a.length) console.log(`    age/birth fields: ${a.join(" | ")}`);
}

// --- 2. Her profile(s) --------------------------------------------------------
console.log(`\n== 2. profiles/{uid} for those accounts ==`);
for (const u of userDocs) {
  const p = await adminDb.collection("profiles").doc(u.id).get();
  if (!p.exists) { console.log(`  uid=${u.id}: no profile`); continue; }
  const d = p.data() as Any;
  const priv = (d.private ?? {}) as Any;
  const vis = (d.visible ?? {}) as Any;
  const meta = (d.meta ?? {}) as Any;
  const bd = (priv.birthDate as { toDate?: () => Date } | null)?.toDate?.() ?? null;
  console.log(`  uid=${u.id}`);
  console.log(`    private.birthDate raw = ${bd ? bd.toISOString() : iso(priv.birthDate)}`);
  if (bd) {
    console.log(`      as Madrid date      = ${madrid(bd)}`);
    console.log(`      as shown on /member = ${utcLabel(bd)} (page formats in UTC)`);
    const h = bd.getUTCHours();
    console.log(`      time of day UTC ${bd.toISOString().slice(11, 19)} → ${h === 22 || h === 23 ? "written by the onboarding question (browser local midnight, Spain)" : h === 0 ? "written at UTC midnight (Reconnect path or a browser outside Spain on UTC)" : "unusual time, not from either known path"}`);
  }
  const answered = aboutMeSteps.map((s) => {
    const v = s.path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Any)[k] : undefined), d);
    return `${s.id}=${v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0) ? "∅" : "✓"}`;
  });
  console.log(`    about-me answers: ${answered.join(" ")}`);
  console.log(`    visible.firstName set=${Boolean(vis.firstName)} gender=${vis.gender ?? "∅"} photos=${Array.isArray(d.photos) ? d.photos.length : 0}`);
  for (const [k, v] of Object.entries(meta).sort()) {
    if (v && typeof v === "object" && typeof (v as { toDate?: unknown }).toDate !== "function" && !Array.isArray(v)) continue;
    console.log(`    meta.${k} = ${iso(v)}`);
  }
  console.log(`    top-level keys: [${Object.keys(d).sort().join(", ")}]; private keys: [${Object.keys(priv).sort().join(", ")}]`);
}

// --- 3. Other records with this email (possible sources) ----------------------
console.log(`\n== 3. Other records with this email ==`);
const lower = EMAIL.toLowerCase();
const sources: Array<[string, Promise<FirebaseFirestore.QueryDocumentSnapshot[]>]> = [
  ["clients", Promise.all(variants.map((v) => adminDb.collection("clients").where("email", "==", v).get())).then((s) => s.flatMap((x) => x.docs))],
  ["matchmakingInquiries", Promise.all(variants.map((v) => adminDb.collection("matchmakingInquiries").where("email", "==", v).get())).then((s) => s.flatMap((x) => x.docs))],
  ["eventParticipants", adminDb.collection("eventParticipants").where("normalizedEmail", "==", lower).get().then((s) => s.docs)],
  ["legacyImports", adminDb.collection("legacyImports").where("normalizedEmail", "==", lower).get().then((s) => s.docs)],
];
for (const [name, pending] of sources) {
  const docs = await pending;
  console.log(`  ${name}: ${docs.length}`);
  for (const doc of docs) {
    const a = ageish(doc.data());
    console.log(`    id=${doc.id} createdAt=${iso(doc.get("createdAt"))} ${a.length ? `age/birth fields: ${a.join(" | ")}` : "no age/birth fields"}`);
  }
}

// --- 4. Whole collection: is any date a default? -------------------------------
const all = await adminDb.collection("profiles").get();
let withBd = 0;
const byTime = new Map<string, number>();
const byValue = new Map<string, number>();
let shownDayEarlier = 0;
let lockedUnfinished = 0;
for (const doc of all.docs) {
  const bd = (doc.get("private.birthDate") as { toDate?: () => Date } | null)?.toDate?.();
  if (!bd) continue;
  withBd++;
  tally(byTime, bd.toISOString().slice(11, 16) + " UTC");
  tally(byValue, bd.toISOString());
  if (utcLabel(bd) !== madrid(bd)) shownDayEarlier++;
  if (!doc.get("meta.aboutMeComplete")) lockedUnfinished++;
}
console.log(`\n== 4. All profiles: ${all.size}, with a birth date: ${withBd} ==`);
console.log(`  time of day of stored birth dates:\n${show(byTime)}`);
const repeated = [...byValue.entries()].filter(([, n]) => n > 1);
console.log(`  exact same birth date shared by 2+ profiles: ${repeated.length ? repeated.map(([v, n]) => `${n}× (value hidden, ${v.slice(0, 4)})`).join(", ") : "none"}`);
const same = [...byValue.entries()].filter(([v]) => v.startsWith("1985-07-0")).reduce((s, [, n]) => s + n, 0);
console.log(`  profiles whose birth date is 7–9 July 1985 (any time): ${same}`);
console.log(`  profiles where /member shows a different day than the Spanish date: ${shownDayEarlier}`);
console.log(`  profiles with a birth date but About-me not complete: ${lockedUnfinished}`);
console.log(`\nDone. Nothing was written.`);
