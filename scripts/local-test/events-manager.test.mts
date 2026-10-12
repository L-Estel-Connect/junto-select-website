// Pure tests for the Events Manager rules (no emulator needed):
//   npx tsx --conditions=react-server scripts/local-test/events-manager.test.mts
import { parseTicketTailorEventRef, validateEventInput, DEFAULT_EVENT_IMAGES } from "../../src/lib/events/editing";
import { pickSeriesEvent } from "../../src/lib/events/ticketTailorImport";
import { formatEventDate, toPublicEvent, upcomingPublicEvents } from "../../src/lib/events/publicView";
import type { EligibleTicketTailorEventDocument } from "../../src/lib/eventBenefits/types";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

// ---- Pasting a Ticket Tailor link ----
check("ref: public event link", parseTicketTailorEventRef("https://www.tickettailor.com/events/juntoselect/2439069") === "2439069");
check("ref: link with trailing slash and query", parseTicketTailorEventRef("https://www.tickettailor.com/events/juntoselect/2439069/?ref=x") === "2439069");
check("ref: bare number", parseTicketTailorEventRef(" 2439069 ") === "2439069");
check("ref: API id ev_", parseTicketTailorEventRef("ev_2439069") === "2439069");
check("ref: other site rejected", parseTicketTailorEventRef("https://example.com/events/2439069") === null);
check("ref: ticket type id rejected", parseTicketTailorEventRef("tt_6869922") === null);
check("ref: empty rejected", parseTicketTailorEventRef("") === null);

// ---- Form validation ----
const base = { label: "Junto Select Signature", eventDate: "2026-11-26", publicStatus: "coming_soon" };
const v = (raw: Record<string, unknown>, linked = false) => validateEventInput(raw, linked);
const ok = v(base);
check("valid: coming soon without link, venue or price", ok.ok && ok.value.city === "Madrid" && ok.value.priceFromEuros === null && ok.value.venuePublic === null);
check("invalid: no title", !v({ ...base, label: " " }).ok);
check("invalid: status other than draft without a date", !v({ label: "X", publicStatus: "coming_soon" }).ok);
check("valid: draft without a date", v({ label: "X" }).ok);
check("invalid: bad time", !v({ ...base, startTime: "8pm" }).ok);
check("invalid: tickets available without a checkout link", !v({ ...base, publicStatus: "tickets_available" }).ok);
check("valid: tickets available with a link", v({ ...base, publicStatus: "tickets_available", ticketTailorCheckoutUrl: "https://www.tickettailor.com/events/juntoselect/2439069" }, true).ok);
check("invalid: checkout link that is not a web address", !v({ ...base, ticketTailorCheckoutUrl: "tickettailor juntoselect" }).ok);
check("invalid: benefit on a manual event", !v({ ...base, memberBenefitEnabled: true, ticketTailorTicketTypeIds: ["tt_1"] }).ok);
check("invalid: benefit without ticket types", !v({ ...base, memberBenefitEnabled: true }, true).ok);
check("invalid: event id typed as ticket type", !v({ ...base, memberBenefitEnabled: true, ticketTailorTicketTypeIds: ["2439069"] }, true).ok);
check("valid: benefit on a linked event with ticket types", v({ ...base, memberBenefitEnabled: true, ticketTailorTicketTypeIds: ["tt_1"] }, true).ok);
check("invalid: negative price", !v({ ...base, priceFromEuros: "-3" }).ok);
const priced = v({ ...base, priceFromEuros: "45.5" });
check("valid: price kept as a number", priced.ok && priced.value.priceFromEuros === 45.5);
check("valid: default image", v({ ...base, imageUrl: DEFAULT_EVENT_IMAGES[1].url }).ok);
check("valid: uploaded image", v({ ...base, imageUrl: "/api/events/image?path=events/x/1.jpg" }).ok);
check("invalid: javascript image", !v({ ...base, imageUrl: "javascript:alert(1)" }).ok);
check("invalid: unknown status falls back to draft", (() => { const r = v({ label: "X", publicStatus: "live" }); return r.ok && r.value.publicStatus === "draft"; })());

// ---- What the website shows ----
const now = new Date("2026-10-12T10:00:00+02:00");
const ev = (id: string, over: Partial<EligibleTicketTailorEventDocument>): EligibleTicketTailorEventDocument => ({
  ticketTailorEventId: id, ticketTailorTicketTypeIds: [], label: id, eventDate: "2026-11-01", memberBenefitEnabled: false,
  reconnectEnabled: false, reconnectForceClosedAt: null, ticketTailorCheckoutUrl: null, createdAt: null, updatedAt: null,
  lastSyncedAt: null, lastSyncResult: null, published: true, publicStatus: "coming_soon", ...over,
} as EligibleTicketTailorEventDocument);
const list = upcomingPublicEvents([
  ev("nov26", { eventDate: "2026-11-26" }),
  ev("oct29", { eventDate: "2026-10-29", startTime: "20:00", publicStatus: "tickets_available", ticketTailorCheckoutUrl: "https://www.tickettailor.com/events/juntoselect/2439069" }),
  ev("unpublished", { published: false }),
  ev("draft", { publicStatus: "draft" }),
  ev("completed", { publicStatus: "completed" }),
  ev("archived", { archivedAt: new Date() } as Partial<EligibleTicketTailorEventDocument>),
  ev("past", { eventDate: "2026-10-01" }),
  ev("legacy", { published: undefined, publicStatus: undefined }),
  ev("today", { eventDate: "2026-10-12", startTime: "21:00" }),
], now);
check("public list: only published, upcoming, public statuses", list.map((e) => e.id).join(",") === "today,oct29,nov26", list.map((e) => e.id).join(","));
check("public list: tickets available links to Ticket Tailor", list.find((e) => e.id === "oct29")?.bookingUrl === "https://www.tickettailor.com/events/juntoselect/2439069");
check("public list: coming soon has no purchase link", list.find((e) => e.id === "nov26")?.bookingUrl === null);
check("public: sold out has no purchase link even with one saved",
  toPublicEvent(ev("so", { publicStatus: "sold_out", ticketTailorCheckoutUrl: "https://www.tickettailor.com/x" }))?.bookingUrl === null);
check("public: manual event never links out", toPublicEvent(ev("m", { publicStatus: "tickets_available", ticketTailorLinked: false, ticketTailorCheckoutUrl: "https://www.tickettailor.com/x" }))?.bookingUrl === null);
check("public: 20 % tag follows the benefit switch",
  toPublicEvent(ev("b", { memberBenefitEnabled: true, ticketTailorTicketTypeIds: ["tt_1"] }))?.selectBenefit === true &&
  toPublicEvent(ev("c", { memberBenefitEnabled: false, ticketTailorTicketTypeIds: ["tt_1"] }))?.selectBenefit === false);
check("public: date in Spanish", formatEventDate({ date: "2026-10-29", time: "20:00" }) === "jueves, 29 de octubre · 20:00", formatEventDate({ date: "2026-10-29", time: "20:00" }));

// ---- Ticket Tailor series: the public link's number is a series ----
const tNow = new Date("2026-10-12T10:00:00Z");
const evAt = (id: string, iso: string) => ({ id, start: { unix: Date.parse(iso) / 1000 } });
check("series: picks the next date", pickSeriesEvent([evAt("ev_b", "2026-11-26T19:00:00Z"), evAt("ev_a", "2026-10-29T19:00:00Z"), evAt("ev_old", "2026-09-01T19:00:00Z")], tNow)?.id === "ev_a");
check("series: all past picks the latest", pickSeriesEvent([evAt("ev_1", "2026-08-01T19:00:00Z"), evAt("ev_2", "2026-09-01T19:00:00Z")], tNow)?.id === "ev_2");
check("series: empty gives nothing", pickSeriesEvent([], tNow) === null);

console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
process.exit(failed ? 1 : 0);
