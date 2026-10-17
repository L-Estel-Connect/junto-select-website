// Seeds the Firebase EMULATORS with made-up data shaped like today's
// Introductions profiles, so we can check the new membership flow leaves
// them alone. Refuses to run unless the emulator hosts are set and the
// project id starts with "demo-" (a project that cannot exist in the cloud).
//
//   node scripts/local-test/seed.mjs            seed
//   node scripts/local-test/seed.mjs snapshot   write .local-test/profiles-before.json
//   node scripts/local-test/seed.mjs compare    diff against that snapshot
import fs from "node:fs";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const project = process.env.GCLOUD_PROJECT || "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !project.startsWith("demo-")) {
  console.error("Refusing to run: emulator hosts and a demo- project id are required.");
  process.exit(1);
}

initializeApp({ projectId: project });
const auth = getAuth();
const db = getFirestore();

const ts = (iso) => Timestamp.fromDate(new Date(iso));
const meta = (over) => ({
  onboardingStepIndex: 0, aboutMeComplete: false, photosComplete: false, preferencesComplete: false,
  presentationComplete: false, profileStatus: "draft", onboardingFinalized: false, searchStatus: "passive",
  duplicateStatus: "clear", duplicateOf: null, pendingLegacyActivation: false, legacyImportId: null,
  matchingAnchorAt: null, matchingSubscriptionId: null, matchingPeriodsProcessed: 0, nextMatchingDueAt: null,
  createdAt: ts("2026-03-02T10:00:00Z"), updatedAt: ts("2026-05-14T10:00:00Z"), ...over,
});
const visible = (over) => ({
  firstName: "", gender: null, city: "Madrid", profession: "", educationLevel: null, heightCm: null,
  languages: [], hasChildren: null, hasYoungChildren: null, childrenCount: null, childrenBirthYears: null,
  wantsFutureChildren: null, relationshipIntention: null, smoking: null, drinking: null, activityLevel: null,
  market: "madrid", marketAvailability: "lives_in_market", ...over,
});

// Three existing shapes: a finished unpaid profile, a half-finished one,
// and a legacy contact still waiting to activate. None has paid.
const PEOPLE = [
  { uid: "intro-finalized", email: "prueba.finalizado@example.test", profile: {
    visible: visible({ firstName: "Prueba A", gender: "mujer", profession: "Arquitecta", heightCm: 168, languages: ["es", "en"], hasChildren: true, hasYoungChildren: false, childrenCount: 2, relationshipIntention: "relacion_estable" }),
    private: { birthDate: ts("1975-04-12T00:00:00Z"), incomeRange: null },
    photos: ["profiles/intro-finalized/a.jpg", "profiles/intro-finalized/b.jpg"],
    meta: meta({ aboutMeComplete: true, photosComplete: true, preferencesComplete: true, presentationComplete: true, profileStatus: "active_for_matching", onboardingFinalized: true, onboardingStepIndex: 9, personId: "intro-finalized" }),
  } },
  { uid: "intro-draft", email: "prueba.borrador@example.test", profile: {
    visible: visible({ firstName: "Prueba B", gender: "hombre", profession: "Abogado" }),
    private: { birthDate: ts("1970-09-01T00:00:00Z"), incomeRange: null },
    photos: [],
    meta: meta({ onboardingStepIndex: 3, personId: "intro-draft" }),
  } },
  { uid: "intro-legacy", email: "prueba.legacy@example.test", profile: {
    visible: visible({ firstName: "Prueba C", gender: "mujer", marketAvailability: null }),
    private: { birthDate: null, incomeRange: null },
    photos: [],
    meta: meta({ pendingLegacyActivation: true, legacyImportId: "legacy-001", personId: "intro-legacy" }),
  } },
];

const COLLECTIONS = ["profiles", "billing", "membershipSignups"];

async function dumpPeople() {
  const out = {};
  for (const { uid } of PEOPLE) {
    for (const c of COLLECTIONS) {
      const snap = await db.doc(`${c}/${uid}`).get();
      out[`${c}/${uid}`] = snap.exists ? snap.data() : null;
    }
  }
  return JSON.parse(JSON.stringify(out));
}

const mode = process.argv[2] || "seed";
if (mode === "seed") {
  for (const { uid, email, profile } of PEOPLE) {
    await auth.createUser({ uid, email, emailVerified: true }).catch((e) => {
      if (e.code !== "auth/uid-already-exists") throw e;
    });
    await db.doc(`profiles/${uid}`).set(profile);
    // Reruns start clean: none of the seeded people has paid.
    await db.doc(`billing/${uid}`).delete();
    await db.doc(`membershipSignups/${uid}`).delete();
  }
  console.log(`Seeded ${PEOPLE.length} mock Introductions profiles (no billing, no payments).`);
} else if (mode === "snapshot") {
  fs.mkdirSync(".local-test", { recursive: true });
  fs.writeFileSync(".local-test/profiles-before.json", JSON.stringify(await dumpPeople(), null, 2));
  console.log("Snapshot written.");
} else if (mode === "compare") {
  const before = fs.readFileSync(".local-test/profiles-before.json", "utf8");
  const after = JSON.stringify(await dumpPeople(), null, 2);
  if (before === after) {
    console.log(`UNCHANGED: ${PEOPLE.length} existing profiles identical before and after the test run.`);
  } else {
    fs.writeFileSync(".local-test/profiles-after.json", after);
    console.error("CHANGED: existing profiles differ; see .local-test/profiles-before.json vs profiles-after.json");
    process.exit(1);
  }
}
