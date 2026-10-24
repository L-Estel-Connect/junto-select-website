// READ-ONLY audit: are Instagram comment-to-DM replies still going out?
// Reads the automation's own Firestore records (state, per-Reel automations,
// comments, reply locks, webhook deliveries) and reports: webhook arrivals,
// keyword detection, send outcomes and Meta errors, the last successful and
// first failed send, comments stuck or skipped, and which could be retried
// by hand without a duplicate. Never calls Instagram, never decrypts the
// token (only reports whether one is stored and when it expires), and writes
// nothing: every Firestore write method is replaced by one that throws before
// any data is loaded, and the credentials must be the read-only audit
// service account (Datastore Viewer).
//
//   AUDIT_DAYS=10 npx tsx --conditions=react-server scripts/audit/instagram-dm-audit.mts
//
// Credentials: the user's own ADC is wrapped, for this process only, in an
// impersonation of AUDIT_SA (default claude-readonly-audit). Nothing global
// is changed. Usernames are masked; comment text is shortened.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const EMULATOR = process.env.AUDIT_EMULATOR_HOST ?? null;
const PROJECT = EMULATOR ? "demo-junto-select" : "select-dev-508407";
const SA = process.env.AUDIT_SA ?? `claude-readonly-audit@${PROJECT}.iam.gserviceaccount.com`;
const DAYS = Number(process.env.AUDIT_DAYS ?? 10);

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
const { matchesKeyword, normalizeForMatch } = await import("../../src/lib/instagram/keyword");
const { MANUALLY_SENDABLE } = await import("../../src/lib/instagram/decide");
const { PRIVATE_REPLY_WINDOW_MS, DEFAULT_DAILY_LIMIT } = await import("../../src/lib/instagram/config");

type Any = Record<string, any>;
const ms = (v: unknown): number | null => {
  const t = v as { toMillis?: () => number } | null | undefined;
  return t?.toMillis ? t.toMillis() : typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : null;
};
const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const t = (v: unknown) => {
  const m = ms(v);
  return m == null ? "—" : `${fmt.format(m)} Madrid`;
};
const day = (m: number | null) => (m == null ? "?" : fmt.format(m).slice(0, 10));
const hour = (m: number | null) => (m == null ? "?" : fmt.format(m).slice(0, 13) + "h");
const mask = (u: unknown) => (typeof u === "string" && u ? `${u.slice(0, 2)}***` : "—");
const tally = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const show = (m: Map<string, number>, indent = "    ") => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${indent}${String(v).padStart(5)}  ${k}`).join("\n") || `${indent}(none)`;
const now = Date.now();
const since = now - DAYS * 86400_000;

console.log(`READ-ONLY Instagram DM audit · project ${PROJECT} · as ${SA} · ${new Date().toISOString()} · window ${DAYS} days`);

// --- 1. Account state (token presence/expiry only) ----------------------------
const s = ((await adminDb.doc("instagramAutomation/state").get()).data() ?? {}) as Any;
console.log("\n== 1. Account state (instagramAutomation/state) ==");
console.log(`  username=@${s.username} accountType=${s.accountType} igUserId=${s.igUserId} oauthUserId=${s.oauthUserId}`);
console.log(`  token stored=${!!s.token} tokenExpiresAt=${t(s.tokenExpiresAt)} (${s.tokenExpiresAt ? Math.round(((ms(s.tokenExpiresAt) ?? 0) - now) / 86400_000) + " days left" : "?"}) connectedAt=${t(s.connectedAt)} by=${s.connectedBy ?? "—"}`);
console.log(`  permissions=${JSON.stringify(s.permissions ?? null)} subscribed=${s.subscribed} subscribeError=${s.subscribeError ?? null}`);
console.log(`  dailyLimit=${s.dailyLimit ?? `(default ${DEFAULT_DAILY_LIMIT})`} dailyDate=${s.dailyDate} dailyCount=${s.dailyCount} sentTotal=${s.sentTotal} updatedAt=${t(s.updatedAt)} migratedAt=${t(s.migratedAt)}`);
console.log(`  lastHealth=${JSON.stringify(s.lastHealth ?? null)}`);

// --- 2. Automations -----------------------------------------------------------
const autos = await adminDb.collection("instagramAutomations").get();
console.log(`\n== 2. Automations (${autos.size}) ==`);
const autoByMedia = new Map<string, Any & { id: string }>();
for (const d of autos.docs) {
  const a = d.data();
  autoByMedia.set(a.mediaId, { id: d.id, ...a });
  console.log(`  ${d.id} media=${a.mediaId} status=${a.status} keyword=${JSON.stringify(a.keyword)} createdAt=${t(a.createdAt)} activeSince=${t(a.activeSince)} updatedAt=${t(a.updatedAt)}`);
  console.log(`      permalink=${a.mediaPermalink ?? "—"} caption="${String(a.mediaCaption ?? "").slice(0, 60).replace(/\s+/g, " ")}"`);
  console.log(`      replyText(${String(a.replyText ?? "").length} chars)="${String(a.replyText ?? "").slice(0, 160).replace(/\s+/g, " ")}"`);
}

// --- 3. Comments --------------------------------------------------------------
const commentsSnap = await adminDb.collection("instagramComments").get();
const comments = commentsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Any) }));
const written = (c: Any) => (typeof c.writtenAt === "number" ? c.writtenAt * 1000 : ms(c.receivedAt));
console.log(`\n== 3. Comments (instagramComments: ${comments.length} in total) ==`);
const byMedia = new Map<string, Any[]>();
for (const c of comments) byMedia.set(c.mediaId ?? "?", [...(byMedia.get(c.mediaId ?? "?") ?? []), c]);

const locksSnap = await adminDb.collection("instagramReplyLocks").get();
const locks = new Map(locksSnap.docs.map((d) => [d.id, d.data() as Any]));
console.log(`  reply locks: ${locks.size}`);

for (const [mediaId, list] of byMedia) {
  const a = autoByMedia.get(mediaId);
  console.log(`\n  --- Reel ${mediaId} · automation ${a?.id ?? "none"} · keyword ${JSON.stringify(a?.keyword)} · status ${a?.status} · ${list.length} comments ---`);
  const dec = new Map<string, number>();
  const src = new Map<string, number>();
  list.forEach((c) => {
    tally(dec, String(c.decision));
    tally(src, `${c.source}${c.viaWebhook ? "+webhook" : ""}`);
  });
  console.log("  decisions (all time):\n" + show(dec));
  console.log("  first seen via:\n" + show(src));

  const recent = list.filter((c) => (ms(c.receivedAt) ?? 0) >= since);
  const grid = new Map<string, Map<string, number>>();
  for (const c of recent) {
    const k = day(ms(c.receivedAt));
    if (!grid.has(k)) grid.set(k, new Map());
    tally(grid.get(k)!, `${c.decision}${c.viaWebhook ? "" : "(api-only)"}`);
  }
  console.log(`  per day received (last ${DAYS} days), decision counts:`);
  for (const [k, m] of [...grid.entries()].sort()) console.log(`    ${k}: ${[...m.entries()].map(([d, n]) => `${d}=${n}`).join(" ")}`);

  const sent = list.filter((c) => c.decision === "sent").sort((x, y) => (ms(x.sentAt) ?? 0) - (ms(y.sentAt) ?? 0));
  const failed = list.filter((c) => c.decision === "send_failed").sort((x, y) => (ms(x.failedAt) ?? 0) - (ms(y.failedAt) ?? 0));
  const last = sent.at(-1);
  console.log(`  sent: ${sent.length}. first ${t(sent[0]?.sentAt)} · LAST SUCCESS ${t(last?.sentAt)} (comment ${last?.id ?? "—"}, by ${last?.sentBy ?? "—"})`);
  console.log(`  send_failed: ${failed.length}. FIRST FAILURE ${t(failed[0]?.failedAt)} (comment ${failed[0]?.id ?? "—"}) · last ${t(failed.at(-1)?.failedAt)}`);
  const errs = new Map<string, number>();
  failed.forEach((c) => tally(errs, `code=${c.error?.code} sub=${c.error?.subcode} http=${c.error?.status} type=${c.error?.type} · ${String(c.error?.message ?? "").slice(0, 140)}`));
  console.log("  failure reasons:\n" + show(errs));
  const errDays = new Map<string, number>();
  failed.forEach((c) => tally(errDays, hour(ms(c.failedAt))));
  if (failed.length) console.log("  failures per hour:\n" + show(errDays));
  const sentHours = new Map<string, number>();
  sent.filter((c) => (ms(c.sentAt) ?? 0) >= since).forEach((c) => tally(sentHours, hour(ms(c.sentAt))));
  console.log("  sends per hour (window):\n" + [...sentHours.entries()].sort().map(([k, v]) => `    ${k} ${v}`).join("\n"));

  const dl = list.filter((c) => c.decision === "daily_limit").sort((x, y) => (ms(x.receivedAt) ?? 0) - (ms(y.receivedAt) ?? 0));
  if (dl.length) {
    const dlDays = new Map<string, number>();
    dl.forEach((c) => tally(dlDays, day(ms(c.receivedAt))));
    console.log(`  daily_limit: ${dl.length}, first ${t(dl[0].receivedAt)}, last ${t(dl.at(-1)!.receivedAt)}; per day:\n` + show(dlDays));
  }
  const stuck = list.filter((c) => c.decision === "sending");
  console.log(`  stuck "sending" (reserved, never finished): ${stuck.length}${stuck.length ? " → " + stuck.slice(0, 20).map((c) => `${c.id}@${t(c.receivedAt)}`).join(", ") : ""}`);
  const rp = list.filter((c) => c.decision === "repeat_person");
  console.log(`  repeat_person (same person already had a reply on this Reel): ${rp.length}`);

  // Keyword detection check
  if (a?.keyword) {
    const kw = normalizeForMatch(a.keyword);
    const mismatch = list.filter((c) => !!c.keywordMatched !== matchesKeyword(c.text, [a.keyword]));
    const near = list.filter((c) => !c.keywordMatched && c.text && normalizeForMatch(c.text).includes(kw));
    console.log(`  keyword check: stored keywordMatched disagrees with today's matcher on ${mismatch.length} comments`);
    console.log(`  not matched but containing "${kw}" inside a word (e.g. "redd", "red."?): ${near.length}`);
    near.slice(0, 25).forEach((c) => console.log(`    ${c.id} ${t(c.receivedAt)} decision=${c.decision} text="${String(c.text).slice(0, 40).replace(/\s+/g, " ")}"`));
    const nk = list.filter((c) => c.decision === "no_keyword" && (ms(c.receivedAt) ?? 0) >= since);
    console.log(`  no_keyword in window: ${nk.length}; samples:`);
    nk.slice(-15).forEach((c) => console.log(`    "${String(c.text ?? "").slice(0, 30).replace(/\s+/g, " ")}"`));
  }

  // Keyword comments that got no DM, and whether a hand retry would be safe
  const unsent = list.filter((c) => c.keywordMatched && c.decision !== "sent");
  const reasons = new Map<string, number>();
  let retryable = 0;
  let retryableExpired = 0;
  const retryList: string[] = [];
  for (const c of unsent) {
    const w = written(c) ?? 0;
    const inWindow = now - w <= PRIVATE_REPLY_WINDOW_MS;
    const person = c.fromId ?? c.fromUsername ?? null;
    const lock = locks.get(`${mediaId}_${person ?? c.id}`);
    const otherLock = lock && lock.commentId !== c.id;
    const sentToPerson = list.some((o) => o.id !== c.id && o.decision === "sent" && (o.fromId ?? o.fromUsername) === person);
    tally(reasons, `${c.decision}${inWindow ? "" : " (past 7 days)"}${otherLock ? " [person has another lock]" : ""}${sentToPerson ? " [person already got a DM]" : ""}`);
    if (MANUALLY_SENDABLE.has(c.decision) && !otherLock && !sentToPerson) {
      if (inWindow) {
        retryable++;
        retryList.push(`${c.id} ${c.decision} written ${t(w)} by ${mask(c.fromUsername)}`);
      } else retryableExpired++;
    }
  }
  console.log(`  keyword comments WITHOUT a DM: ${unsent.length}\n` + show(reasons));
  console.log(`  safely retryable by hand now (sendable state, within 7 days, nobody-else lock, person never got a DM): ${retryable}; too old for Meta: ${retryableExpired}`);
  retryList.slice(0, 60).forEach((l) => console.log(`    ${l}`));
  const people = new Set(unsent.filter((c) => (now - (written(c) ?? 0)) <= PRIVATE_REPLY_WINDOW_MS).map((c) => c.fromId ?? c.fromUsername ?? c.id));
  console.log(`  distinct people with an unsent keyword comment in the last 7 days: ${people.size}`);
}

// --- 4. Webhook deliveries ----------------------------------------------------
const delSnap = await adminDb.collection("instagramWebhookDeliveries").where("at", ">=", new Date(since)).orderBy("at", "asc").get();
const dels = delSnap.docs.map((d) => d.data() as Any);
const lastAny = (await adminDb.collection("instagramWebhookDeliveries").orderBy("at", "desc").limit(1).get()).docs[0]?.data();
console.log(`\n== 4. Webhook deliveries (last ${DAYS} days: ${dels.length}; most recent ever: ${t(lastAny?.at)}) ==`);
const dd = new Map<string, Map<string, number>>();
for (const d of dels) {
  const k = day(ms(d.at));
  if (!dd.has(k)) dd.set(k, new Map());
  const m = dd.get(k)!;
  tally(m, d.signatureValid ? "valid" : "INVALID_SIG");
  tally(m, "comments", d.comments ?? 0);
  for (const r of d.results ?? []) tally(m, `r:${r}`);
}
for (const [k, m] of [...dd.entries()].sort()) console.log(`  ${k}: ${[...m.entries()].map(([x, n]) => `${x}=${n}`).join(" ")}`);
const firstErr = dels.find((d) => (d.results ?? []).includes("error"));
const firstFail = dels.find((d) => (d.results ?? []).includes("send_failed"));
const firstDl = dels.find((d) => (d.results ?? []).includes("daily_limit"));
const lastSent = [...dels].reverse().find((d) => (d.results ?? []).includes("sent"));
console.log(`  last delivery with result "sent": ${t(lastSent?.at)}`);
console.log(`  first delivery with "send_failed": ${t(firstFail?.at)} · with "daily_limit": ${t(firstDl?.at)} · with "error" (exception): ${t(firstErr?.at)}`);
const hrs = new Map<string, number>();
dels.filter((d) => (ms(d.at) ?? 0) >= now - 3 * 86400_000).forEach((d) => tally(hrs, hour(ms(d.at))));
console.log("  deliveries per hour (last 3 days):\n" + [...hrs.entries()].sort().map(([k, v]) => `    ${k} ${v}`).join("\n"));
console.log("  last 15 deliveries:");
dels.slice(-15).forEach((d) => console.log(`    ${t(d.at)} sig=${d.signatureValid} object=${d.object} fields=${JSON.stringify(d.fields)} comments=${d.comments} results=${JSON.stringify(d.results)}`));

console.log("\nDone. Nothing was written.");
process.exit(0);
