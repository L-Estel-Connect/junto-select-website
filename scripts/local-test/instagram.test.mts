// Pure tests for the Instagram comment-to-DM automation (no emulator, no network):
//   npx tsx --conditions=react-server scripts/local-test/instagram.test.mts
import { createHmac } from "node:crypto";
import { matchesKeyword } from "../../src/lib/instagram/keyword";
import { decrypt, encrypt, isValidMetaSignature } from "../../src/lib/instagram/crypto";
import { decide, extractCommentChanges, madridDay } from "../../src/lib/instagram/decide";
import { getAllowedUsername, validateKeyword, validateReplyText } from "../../src/lib/instagram/config";

let failed = 0;
function check(name: string, ok: boolean) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

// Keyword
for (const t of ["SELECT", "select", "Select", "SELECT!", "¡Sélect!", "Quiero info: select 🙌", "select."]) check(`keyword matches «${t}»`, matchesKeyword(t, ["SELECT"]));
for (const t of ["selection", "preselect", "SELECTO", "hola", "", "sel ect"]) check(`keyword ignores «${t}»`, !matchesKeyword(t, ["SELECT"]));
check("multi-word keyword", matchesKeyword("Quiero mi INVITACIÓN ya", ["mi invitacion"]));

// Settings validation
check("keyword accepted", validateKeyword(" SELECT ") === "SELECT");
check("empty keyword refused", validateKeyword("  ") === null && validateKeyword("!!!") === null);
check("message with https link accepted", validateReplyText("Hola, aquí: https://www.juntoselect.com/") !== null);
check("message without link refused", validateReplyText("Hola") === null);
check("http-only link refused", validateReplyText("Hola http://juntoselect.com") === null);
check("over-long message refused", validateReplyText("https://a.es " + "x".repeat(1000)) === null);

// Account allowlist
process.env.INSTAGRAM_ACCOUNT_USERNAME = "@JuntoSelect";
check("allowed account normalized", getAllowedUsername() === "juntoselect");

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
const nowS = Math.floor(Date.now() / 1000);
const value = { from: { id: "999", username: "Some_Follower" }, media: { id: "M1", media_product_type: "REELS" }, id: "C1", text: "Select!" };
const changesShape = { object: "instagram", entry: [{ id: "IG1", time: nowS, changes: [{ field: "comments", value }] }] };
const flatShape = { object: "instagram", entry: [{ id: "IG1", time: nowS, field: "comments", value }] };
const a = extractCommentChanges(changesShape).comments;
const b = extractCommentChanges(flatShape).comments;
check("changes[] shape parsed", a.length === 1 && a[0].commentId === "C1" && a[0].mediaId === "M1" && a[0].fromUsername === "Some_Follower");
check("flat shape parsed", b.length === 1 && b[0].text === "Select!");
check("other fields ignored", extractCommentChanges({ entry: [{ id: "IG1", changes: [{ field: "mentions", value: { id: "x" } }] }] }).comments.length === 0);
check("outer-array shape parsed (as in the docs)", extractCommentChanges([flatShape]).comments.length === 1);
check("garbage ignored", extractCommentChanges("nope").comments.length === 0);

// Decisions
const ts = (ms: number) => ({ toMillis: () => ms });
const now = Date.now();
const account = { token: { ciphertext: "x", iv: "x", tag: "x" }, igUserId: "IG1", username: "juntoselect" };
const auto = {
  mediaId: "M1",
  keyword: "SELECT",
  replyText: "Hola https://www.juntoselect.com/",
  status: "active" as const,
  createdAt: ts(now - 3600_000),
  activeSince: ts(now - 60_000),
};
const c = a[0];
const at = (msAgo: number) => ({ ...c, entryTime: Math.floor((now - msAgo) / 1000) });
check("new matching comment is sent when active", decide(c, account, auto, now) === "send");
check("paused: detected, not sent", decide(c, account, { ...auto, status: "paused" }, now) === "dry_run");
check("off: ignored and not stored", decide(c, account, { ...auto, status: "off" }, now) === "automation_off");
check("not connected", decide(c, { ...account, token: undefined }, auto, now) === "not_connected");
check("Reel without automation ignored", decide(c, account, null, now) === "no_automation");
check("other Reel's automation ignored", decide({ ...c, mediaId: "M2" }, account, auto, now) === "no_automation");
check("no keyword ignored", decide({ ...c, text: "qué bonito" }, account, auto, now) === "no_keyword");
check("custom keyword", decide({ ...c, text: "quiero INFO" }, account, { ...auto, keyword: "info" }, now) === "send");
check("own comment ignored", decide({ ...c, fromId: "IG1" }, account, auto, now) === "own_comment");
check("own username ignored", decide({ ...c, fromUsername: "JuntoSelect", fromId: "5" }, account, auto, now) === "own_comment");
check("other account's webhook ignored", decide({ ...c, entryId: "OTHER" }, account, auto, now) === "other_account");
check("written before the automation existed: historical, never sent", decide(at(2 * 3600_000), account, auto, now) === "historical");
check("historical even when active and within 7 days", decide(at(3600_000 + 1000), account, auto, now) === "historical");
check("written after creation but before activation: not sent", decide(at(30 * 60_000), account, auto, now) === "before_activation");
check("active with no activation time: not sent", decide(c, account, { ...auto, activeSince: null }, now) === "before_activation");
check("older than 7 days ignored", decide(at(8 * 86400000), account, { ...auto, createdAt: ts(now - 9 * 86400000) }, now) === "too_old");
check("missing message not sent", decide(c, account, { ...auto, replyText: null }, now) === "not_configured");
check("keyword change re-labels (SELECT comment, OCTUBRE keyword)", decide({ ...c, text: "SELECT" }, account, { ...auto, keyword: "OCTUBRE" }, now) === "no_keyword");

// Daily limit day (Madrid)
check("madrid day format", /^\d{4}-\d{2}-\d{2}$/.test(madridDay(now)));
check("madrid day rolls at local midnight", madridDay(Date.UTC(2026, 9, 17, 22, 30)) === "2026-10-18");

console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
process.exit(failed ? 1 : 0);
