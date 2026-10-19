/* eslint-disable @typescript-eslint/no-require-imports -- plain Node audit script */
// READ-ONLY audit: how many candidate profiles have a usable email and phone,
// and in which records. Prints counts and yes/no flags only, never an email
// address or a phone number. Performs no writes.
//   GOOGLE_CLOUD_PROJECT=<project> node scripts/audit/contact-coverage.cjs [firstName city]
// Uses Application Default Credentials (e.g. a read-only Datastore Viewer
// account). Firebase Auth is read only if those credentials allow it.
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const projectId = process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Set GOOGLE_CLOUD_PROJECT.");
  process.exit(1);
}
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const [focusName = "Carlos", focusCity = "Madrid"] = process.argv.slice(2);

const str = (v) => (typeof v === "string" ? v.trim() : "");
const phoneKey = (p) => {
  const d = str(p).replace(/\D/g, "");
  return d.length === 11 && d.startsWith("34") ? d.slice(2) : d;
};
const lower = (e) => str(e).toLowerCase();

(async () => {
  const [profiles, users, clients, inquiries, participants, legacy] = await Promise.all(
    ["profiles", "users", "clients", "matchmakingInquiries", "eventParticipants", "legacyImports"].map((c) => db.collection(c).get()),
  );
  const userEmail = new Map(users.docs.map((d) => [d.id, lower(d.get("email"))]));

  let authEmail = null;
  try {
    authEmail = new Map();
    let token;
    do {
      const page = await getAuth().listUsers(1000, token);
      page.users.forEach((u) => authEmail.set(u.uid, lower(u.email)));
      token = page.pageToken;
    } while (token);
  } catch (e) {
    authEmail = null;
    console.log(`(Firebase Auth not readable with these credentials: ${e.code || e.message})`);
  }

  const phonesByEmail = new Map();
  const add = (email, phone, source) => {
    if (!email || !phoneKey(phone)) return;
    if (!phonesByEmail.has(email)) phonesByEmail.set(email, new Set());
    phonesByEmail.get(email).add(source);
  };
  clients.docs.forEach((d) => add(lower(d.get("email")), d.get("phone"), "cliente"));
  inquiries.docs.forEach((d) => add(lower(d.get("email")), d.get("telefono"), "solicitud"));
  participants.docs.forEach((d) => add(lower(d.get("normalizedEmail")), d.get("phone"), "evento"));
  legacy.docs.forEach((d) => add(lower(d.get("normalizedEmail")), d.get("prefill.phone"), "importacion"));

  const rows = profiles.docs.map((d) => {
    const meta = d.get("meta") || {};
    const email = userEmail.get(d.id) || (authEmail && authEmail.get(d.id)) || "";
    const profilePhone = !!phoneKey(d.get("contactPreferences.phone"));
    const otherSources = email ? [...(phonesByEmail.get(email) || [])] : [];
    return {
      uid: d.id,
      firstName: str(d.get("visible.firstName")),
      city: str(d.get("visible.city")),
      complete: meta.profileStatus === "active_for_matching" && meta.duplicateStatus !== "confirmed_duplicate",
      searchStatus: meta.searchStatus || "passive",
      usersDocEmail: !!userEmail.get(d.id),
      authEmail: authEmail ? !!authEmail.get(d.id) : "unknown",
      email: !!email,
      profilePhone,
      preferredMethod: d.get("contactPreferences.preferredMethod") || null,
      otherPhoneSources: otherSources,
      anyPhone: profilePhone || otherSources.length > 0,
    };
  });

  const summarize = (label, list) => {
    const n = (f) => list.filter(f).length;
    console.log(`\n${label}: ${list.length}`);
    console.log(`  email in users/{uid}:          ${n((r) => r.usersDocEmail)}`);
    console.log(`  email in Firebase Auth:        ${authEmail ? n((r) => r.authEmail === true) : "not readable"}`);
    console.log(`  any usable email:              ${n((r) => r.email)}`);
    console.log(`  phone in the profile:          ${n((r) => r.profilePhone)}`);
    console.log(`  phone only in another record:  ${n((r) => !r.profilePhone && r.anyPhone)}`);
    console.log(`  no phone anywhere:             ${n((r) => !r.anyPhone)}`);
    console.log(`  preferred method set:          ${n((r) => r.preferredMethod)}`);
  };
  console.log(`Project ${projectId} (read-only)`);
  summarize("All profiles", rows);
  summarize("Complete profiles (eligible for proposals)", rows.filter((r) => r.complete));
  summarize("Complete, active search (paid)", rows.filter((r) => r.complete && r.searchStatus === "active_search"));

  const focus = rows.filter((r) => r.firstName.toLowerCase() === focusName.toLowerCase() && r.city.toLowerCase().includes(focusCity.toLowerCase()));
  console.log(`\n${focusName} (${focusCity}): ${focus.length} profile(s)`);
  for (const r of focus) {
    console.log(
      `  uid ${r.uid.slice(0, 6)}… complete=${r.complete} search=${r.searchStatus} usersDocEmail=${r.usersDocEmail} authEmail=${r.authEmail} profilePhone=${r.profilePhone} preferred=${r.preferredMethod} otherPhones=[${r.otherPhoneSources.join(",")}]`,
    );
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
