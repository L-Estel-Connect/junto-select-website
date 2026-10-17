// Instagram automations against the Firestore emulator, with Instagram faked
// (no network): the move from one automation to one per Reel, re-labelling,
// historical comments, duplicates, the person lock and the daily limit.
//   firebase emulators:start --project demo-junto-select --only firestore   # terminal 1
//   npx tsx --conditions=react-server scripts/local-test/instagram-automations.test.mts
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-junto-select";
process.env.INSTAGRAM_APP_SECRET = "local-test-secret";
process.env.INSTAGRAM_APP_ID = "123";
process.env.INSTAGRAM_ACCOUNT_USERNAME = "juntoselect";
process.env.APP_BASE_URL = "http://localhost:3000";

let failed = 0;
function check(name: string, ok: boolean) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

// Fake Instagram: the comments the API "shows" per Reel, and every private reply attempted.
const apiComments: Record<string, { id: string; text: string; timestamp: string; from: { id: string; username: string } }[]> = {};
const sends: string[] = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  if (url.pathname.endsWith("/messages") && init?.method === "POST") {
    sends.push(JSON.parse(String(init.body)).recipient.comment_id);
    return json({ recipient_id: "r", message_id: `m${sends.length}` });
  }
  if (url.pathname.endsWith("/me")) return json({ id: "IG1", user_id: "IG1", username: "juntoselect", account_type: "BUSINESS" });
  if (url.pathname.endsWith("/subscribed_apps")) return json({ data: [{ subscribed_fields: ["comments"] }] });
  const m = url.pathname.match(/\/(R\d)\/comments$/);
  if (m) return json({ data: apiComments[m[1]] ?? [] });
  const media = url.pathname.match(/\/(R\d)$/);
  if (media) return json({ id: media[1], comments_count: (apiComments[media[1]] ?? []).length });
  return new Response(JSON.stringify({ error: { message: `unexpected ${url.pathname}` } }), { status: 400 });
}) as typeof fetch;

const { adminDb } = await import("../../src/lib/firebase/admin");
const { encryptToken, stateRef, automationsCol, commentsCol, Timestamp } = await import("../../src/lib/instagram/store");
const { migrateLegacyState, checkAndSync, handleComment, relabelAutomation, sendToOneComment } = await import("../../src/lib/instagram/automation");

for (const col of ["instagramAutomation", "instagramAutomations", "instagramComments", "instagramReplyLocks"]) {
  const snap = await adminDb.collection(col).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

// Production as of 17 Oct, 16:55: one automation on the state doc (Reel R2,
// keyword "Select", switched off), 2 sent replies on the earlier Reel R1, and
// 50 comments on R2 labelled against the old keyword.
const hourAgo = Math.floor(Date.now() / 1000) - 3600;
await stateRef.set({
  token: encryptToken("fake-token"),
  igUserId: "IG1",
  username: "juntoselect",
  mediaId: "R2",
  mediaCaption: "Reel SELECT",
  keyword: "Select",
  replyText: "Hola https://www.juntoselect.com/",
  status: "off",
  sentTotal: 2,
  dailyDate: "2000-01-01",
  dailyCount: 0,
});
for (const [i, person] of ["lara_estel", "lestapelle_"].entries()) {
  await commentsCol.doc(`R1-sent-${i}`).set({ mediaId: "R1", fromUsername: person, fromId: `P${i}`, text: "octubre", decision: "sent", keywordMatched: true, sentText: "Mensaje OCTUBRE https://www.juntoselect.com/", sentAt: Timestamp.now(), writtenAt: hourAgo });
}
const old: { id: string; text: string; timestamp: string; from: { id: string; username: string } }[] = [];
for (let i = 0; i < 50; i += 1) {
  const own = i >= 47;
  const text = i < 40 ? (i % 2 ? "SELECT" : "¡Select!") : "qué bonito";
  const c = { id: `R2-old-${i}`, text, timestamp: new Date((hourAgo - i * 60) * 1000).toISOString(), from: { id: own ? "IG1" : `F${i}`, username: own ? "juntoselect" : `follower${i}` } };
  old.push(c);
  await commentsCol.doc(c.id).set({ mediaId: "R2", entryId: "IG1", fromUsername: c.from.username, fromId: c.from.id, text, writtenAt: hourAgo - i * 60, decision: own ? "own_comment" : "no_keyword", keywordMatched: false });
}
apiComments.R2 = old;

// 1. Migration
await migrateLegacyState("test@local");
const autos = (await automationsCol.get()).docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as { id: string; mediaId: string; keyword: string | null; replyText: string | null; status: string }[];
const r1 = autos.find((a) => a.mediaId === "R1");
const r2 = autos.find((a) => a.mediaId === "R2");
check("migration: one automation per Reel (2)", autos.length === 2 && !!r1 && !!r2);
check("migration: current Reel keeps keyword, message and stays off", r2?.keyword === "Select" && r2?.replyText === "Hola https://www.juntoselect.com/" && r2?.status === "off");
check("migration: earlier Reel keeps its sent message, switched off", r1?.replyText === "Mensaje OCTUBRE https://www.juntoselect.com/" && r1?.status === "off");
await migrateLegacyState("test@local");
check("migration runs once", (await automationsCol.get()).size === 2);

const byDecision = async (mediaId: string) => {
  const snap = await commentsCol.where("mediaId", "==", mediaId).get();
  const out: Record<string, number> = {};
  snap.docs.forEach((d) => (out[d.data().decision] = (out[d.data().decision] ?? 0) + 1));
  return out;
};
const r2Counts = await byDecision("R2");
check("the 40 SELECT comments are now historical", r2Counts.historical === 40);
check("the rest stay: 7 without keyword, 3 own", r2Counts.no_keyword === 7 && r2Counts.own_comment === 3);
check("the 2 test records are untouched", (await byDecision("R1")).sent === 2);

// 2. Activating R2 never answers historical comments
await automationsCol.doc(r2!.id).update({ status: "active", activeSince: Timestamp.now() });
await checkAndSync();
check("activation + sync: no message to the 47 historical comments", sends.length === 0);

// 3. A new comment after activation gets exactly one message, however often it is seen
const fresh = { id: "R2-new-1", text: "select por favor", timestamp: new Date(Date.now() + 1000).toISOString(), from: { id: "N1", username: "newperson" } };
apiComments.R2 = [fresh, ...old];
await checkAndSync();
check("new keyword comment: one message", sends.length === 1 && sends[0] === "R2-new-1");
await checkAndSync();
const viaWebhook = await handleComment({ entryId: "IG1", entryTime: Math.floor(Date.now() / 1000) + 1, commentId: "R2-new-1", parentId: null, text: fresh.text, fromId: "N1", fromUsername: "newperson", mediaId: "R2", mediaProductType: "REELS" }, "webhook");
check("seen again by sync and webhook: still one message", sends.length === 1 && viaWebhook === "duplicate");
const doc = (await commentsCol.doc("R2-new-1").get()).data();
check("sent record keeps the automation's message", doc?.decision === "sent" && doc?.sentText === "Hola https://www.juntoselect.com/" && doc?.viaWebhook === true);

// 4. Same person again: no second message
apiComments.R2 = [{ ...fresh, id: "R2-new-2", text: "SELECT otra vez" }, fresh, ...old];
await checkAndSync();
check("same person, second comment: no second message", sends.length === 1 && (await commentsCol.doc("R2-new-2").get()).data()?.decision === "repeat_person");

// 5. Daily limit
await stateRef.set({ dailyLimit: 1 }, { merge: true });
apiComments.R2 = [{ id: "R2-new-3", text: "select", timestamp: new Date(Date.now() + 2000).toISOString(), from: { id: "N3", username: "third" } }, ...apiComments.R2];
await checkAndSync();
check("daily limit reached: not sent", sends.length === 1 && (await commentsCol.doc("R2-new-3").get()).data()?.decision === "daily_limit");
await stateRef.set({ dailyLimit: 100 }, { merge: true });

// 6. Paused: detected, nothing sent
await automationsCol.doc(r2!.id).update({ status: "paused" });
apiComments.R2 = [{ id: "R2-new-4", text: "Select", timestamp: new Date(Date.now() + 3000).toISOString(), from: { id: "N4", username: "fourth" } }, ...apiComments.R2];
await checkAndSync();
check("paused: new comment detected, not sent", sends.length === 1 && (await commentsCol.doc("R2-new-4").get()).data()?.decision === "dry_run");

// 7. Keyword change re-labels, never sends, never touches sent records
await automationsCol.doc(r2!.id).update({ keyword: "OCTUBRE" });
await relabelAutomation(r2!.id);
const afterChange = await byDecision("R2");
check("keyword changed: SELECT comments re-labelled without keyword", (afterChange.historical ?? 0) === 0 && afterChange.no_keyword >= 47);
check("keyword changed: sent record stays sent", afterChange.sent === 1 && sends.length === 1);
await automationsCol.doc(r2!.id).update({ keyword: "Select" });
await relabelAutomation(r2!.id);
check("keyword back: historical again", (await byDecision("R2")).historical === 40);

// 8. Other Reels are independent
await automationsCol.doc(r1!.id).update({ keyword: "octubre", status: "active", activeSince: Timestamp.now() });
apiComments.R1 = [{ id: "R1-new", text: "OCTUBRE", timestamp: new Date(Date.now() + 1000).toISOString(), from: { id: "N9", username: "ninth" } }];
await checkAndSync();
const r2Auto = (await automationsCol.doc(r2!.id).get()).data();
check("R1 answered with R1's message, R2 settings untouched", sends.at(-1) === "R1-new" && (await commentsCol.doc("R1-new").get()).data()?.sentText === "Mensaje OCTUBRE https://www.juntoselect.com/" && r2Auto?.keyword === "Select" && r2Auto?.status === "paused");

// 9. Manual send to one historical comment (only on an admin's click)
const manual = await sendToOneComment("R2-old-0", "test@local");
check("manual send to one historical comment works", manual === "sent" && sends.at(-1) === "R2-old-0");
check("manual send cannot repeat", (await sendToOneComment("R2-old-0", "test@local")) === "not_allowed");

check("total private replies attempted: 3 (new, R1 new, manual)", sends.length === 3);
console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
process.exit(failed ? 1 : 0);
