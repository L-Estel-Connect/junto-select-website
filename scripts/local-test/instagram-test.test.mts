// Pure tests for the Instagram access test (no emulator, no network):
//   npx tsx --conditions=react-server scripts/local-test/instagram-test.test.mts
import { createHmac } from "node:crypto";
import { matchesKeyword } from "../../src/lib/instagramTest/keyword";
import { decrypt, encrypt, isValidMetaSignature } from "../../src/lib/instagramTest/crypto";
import { decide, extractCommentChanges } from "../../src/lib/instagramTest/webhook";
import { TEST_KEYWORDS, TEST_REPLY_TEXT, instagramTestEnabled } from "../../src/lib/instagramTest/config";

let failed = 0;
function check(name: string, ok: boolean) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

// Keyword
for (const t of ["SELECT", "select", "Select", "SELECT!", "¡Sélect!", "Quiero info: select 🙌", "select."]) check(`keyword matches «${t}»`, matchesKeyword(t, TEST_KEYWORDS));
for (const t of ["selection", "preselect", "SELECTO", "hola", "", "sel ect"]) check(`keyword ignores «${t}»`, !matchesKeyword(t, TEST_KEYWORDS));
check("multi-word keyword", matchesKeyword("Quiero mi INVITACIÓN ya", ["mi invitacion"]));
check("reply text links the live home page", TEST_REPLY_TEXT.endsWith("https://www.juntoselect.com/"));

// Signature
const secret = "test-secret";
const body = JSON.stringify({ object: "instagram", entry: [] });
const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
check("valid signature accepted", isValidMetaSignature(body, sig, secret));
check("wrong secret refused", !isValidMetaSignature(body, sig, "other"));
check("tampered body refused", !isValidMetaSignature(body + " ", sig, secret));
check("missing signature refused", !isValidMetaSignature(body, null, secret));
check("garbage signature refused", !isValidMetaSignature(body, "sha256=zz", secret));

// Token encryption
const key = Buffer.alloc(32, 7);
const enc = encrypt("IGAAtoken", key);
check("token round-trips", decrypt(enc, key) === "IGAAtoken");
check("ciphertext does not contain the token", !Buffer.from(enc.ciphertext, "base64").toString().includes("IGAAtoken"));
let wrongKeyFails = false;
try { decrypt(enc, Buffer.alloc(32, 8)); } catch { wrongKeyFails = true; }
check("wrong key cannot decrypt", wrongKeyFails);

// Payload shapes
const value = { from: { id: "999", username: "Test_Account" }, media: { id: "M1", media_product_type: "REELS" }, id: "C1", text: "Select!" };
const changesShape = { object: "instagram", entry: [{ id: "IG1", time: Math.floor(Date.now() / 1000), changes: [{ field: "comments", value }] }] };
const flatShape = { object: "instagram", entry: [{ id: "IG1", time: Math.floor(Date.now() / 1000), field: "comments", value }] };
const a = extractCommentChanges(changesShape).comments;
const b = extractCommentChanges(flatShape).comments;
check("changes[] shape parsed", a.length === 1 && a[0].commentId === "C1" && a[0].mediaId === "M1" && a[0].fromUsername === "Test_Account");
check("flat shape parsed", b.length === 1 && b[0].text === "Select!");
check("other fields ignored", extractCommentChanges({ entry: [{ id: "IG1", changes: [{ field: "mentions", value: { id: "x" } }] }] }).comments.length === 0);
check("outer-array shape parsed (as in the docs)", extractCommentChanges([flatShape]).comments.length === 1);
check("garbage ignored", extractCommentChanges("nope").comments.length === 0);

// Decisions
const s = { token: { ciphertext: "x", iv: "x", tag: "x" }, igUserId: "IG1", username: "lara_estel", mediaId: "M1", testCommenterUsername: "test_account", sendEnabled: true };
const now = Date.now();
const c = a[0];
check("matching comment is sent", decide(c, s, now) === "send");
check("dry run when sending is off", decide(c, { ...s, sendEnabled: false }, now) === "dry_run");
check("not connected", decide(c, { ...s, token: undefined }, now) === "not_connected");
check("other Reel ignored", decide({ ...c, mediaId: "M2" }, s, now) === "other_reel");
check("no Reel chosen ignored", decide(c, { ...s, mediaId: null }, now) === "other_reel");
check("no keyword ignored", decide({ ...c, text: "qué bonito" }, s, now) === "no_keyword");
check("other commenter ignored", decide({ ...c, fromUsername: "someone_else", fromId: "777" }, s, now) === "not_test_commenter");
check("no test commenter set ignored", decide(c, { ...s, testCommenterUsername: null }, now) === "not_test_commenter");
check("own comment ignored", decide({ ...c, fromId: "IG1" }, s, now) === "own_comment");
check("own username ignored", decide({ ...c, fromUsername: "Lara_Estel", fromId: "5" }, s, now) === "own_comment");
check("other account's webhook ignored", decide({ ...c, entryId: "OTHER" }, s, now) === "other_account");
check("older than 7 days ignored", decide({ ...c, entryTime: Math.floor((now - 8 * 86400000) / 1000) }, s, now) === "too_old");

// Production guard
delete process.env.JUNTO_DEPLOY_ENV;
check("off outside staging", !instagramTestEnabled());
process.env.JUNTO_DEPLOY_ENV = "staging";
check("on in staging", instagramTestEnabled());

console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
process.exit(failed ? 1 : 0);
