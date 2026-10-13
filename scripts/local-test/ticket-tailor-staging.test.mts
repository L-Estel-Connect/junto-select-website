// Pure test: on staging, member 20 % codes are simulated and nothing is sent
// to Ticket Tailor (no emulator, no network):
//   npx tsx --conditions=react-server scripts/local-test/ticket-tailor-staging.test.mts
process.env.JUNTO_DEPLOY_ENV = "staging";
process.env.TICKET_TAILOR_API_KEY = "sk_not_a_real_key";
delete process.env.TICKET_TAILOR_LOCAL_MOCK_URL;

let failed = 0;
function check(name: string, ok: boolean) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

const calls: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push(`${init?.method ?? "GET"} ${String(input)}`);
  return new Response(JSON.stringify({ id: "ev_1" }), { status: 200 });
}) as typeof fetch;

const { getTicketTailorClient, STAGING_SIMULATED_DISCOUNT_PREFIX } = await import("../../src/lib/ticketTailor/client");
const client = getTicketTailorClient();

const d = await client.createDiscount({
  code: "JS-TEST1", name: "x", percentage: 20, maxRedemptions: 1, ticketTypeIds: ["tt_1"], expiresAt: new Date(),
});
check("staging creates a simulated code", d.id === `${STAGING_SIMULATED_DISCOUNT_PREFIX}JS-TEST1` && d.code === "JS-TEST1");
check("staging finds nothing to adopt", (await client.findDiscountByCode("JS-TEST1")) === null);
await client.invalidateDiscount("x");
check("no write ever reaches Ticket Tailor", calls.length === 0);
await client.getEvent("ev_1");
check("event reads still go to Ticket Tailor (Events Manager import)", calls.length === 1 && calls[0].startsWith("GET https://api.tickettailor.com/v1/events/ev_1"));

globalThis.fetch = realFetch;
console.log(failed ? `\n${failed} failed` : "\nAll passed");
process.exit(failed ? 1 : 0);
