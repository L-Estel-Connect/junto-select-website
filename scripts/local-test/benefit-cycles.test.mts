// Pure date tests for the monthly 20 % benefit cycles (no emulator needed):
//   npx tsx --conditions=react-server scripts/local-test/benefit-cycles.test.mts
import { addMonthsYMD, currentBenefitCycle } from "../../src/lib/eventBenefits/eligibility";
import type { BillingDocument } from "../../src/lib/billing/types";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

// Noon Madrid on a given date, so no test sits on a timezone edge by accident.
const at = (ymd: string, hhmm = "12:00") => new Date(`${ymd}T${hhmm}:00+02:00`);
const billing = (status: BillingDocument["status"], periodEnd: Date): BillingDocument => ({
  stripeCustomerId: "cus", stripeSubscriptionId: "sub", status, planKey: null, currentPeriodEnd: periodEnd,
  cancelAtPeriodEnd: false, canceledAt: null, lastPaymentFailedAt: null, termsAcceptance: null, createdAt: null, updatedAt: null,
});

check("addMonths: Jan 31 + 1 clamps to Feb 28", addMonthsYMD("2027-01-31", 1) === "2027-02-28");
check("addMonths: Jan 31 + 2 is back to Mar 31", addMonthsYMD("2027-01-31", 2) === "2027-03-31");
check("addMonths: leap year Feb 29", addMonthsYMD("2028-01-31", 1) === "2028-02-29");
check("addMonths: crosses the year", addMonthsYMD("2026-11-15", 3) === "2027-02-15");

for (const [plan, months] of [["monthly", 1], ["three_month", 3], ["six_month", 6]] as const) {
  const start = at("2026-10-15", "18:30");
  const periodEnd = at(addMonthsYMD("2026-10-15", months), "18:30");
  const b = billing("active", periodEnd);
  const indices: number[] = [];
  for (let m = 0; m < months; m++) {
    const first = currentBenefitCycle(b, start, at(addMonthsYMD("2026-10-15", m)));
    indices.push(first?.index ?? -1);
    check(`${plan}: cycle ${m} starts ${addMonthsYMD("2026-10-15", m)}`, first?.start === addMonthsYMD("2026-10-15", m) && first?.end === addMonthsYMD("2026-10-15", m + 1));
    // The day before the next cycle starts is still cycle m.
    const dayBefore = new Date(at(addMonthsYMD("2026-10-15", m + 1)).getTime() - 86400000);
    check(`${plan}: last day of cycle ${m} still cycle ${m}`, currentBenefitCycle(b, start, dayBefore)?.index === m);
  }
  check(`${plan}: exactly ${months} cycle(s) per paid period`, indices.join(",") === [...Array(months).keys()].join(","));
  check(`${plan}: no cycle once the paid period ends (renewal pending)`, currentBenefitCycle(b, start, at(addMonthsYMD("2026-10-15", months))) === null);
  const renewed = billing("active", at(addMonthsYMD("2026-10-15", 2 * months), "18:30"));
  check(`${plan}: after renewal the count continues at ${months}`, currentBenefitCycle(renewed, start, at(addMonthsYMD("2026-10-15", months)))?.index === months);
}

const start = at("2026-10-15");
const end = at("2026-11-15");
check("canceled: no cycle", currentBenefitCycle(billing("canceled", end), start, at("2026-10-20")) === null);
check("past_due within paid period: cycle kept", currentBenefitCycle(billing("past_due", end), start, at("2026-10-20"))?.index === 0);
check("past_due after period end: no cycle", currentBenefitCycle(billing("past_due", end), start, at("2026-11-20")) === null);
check("unknown start: no cycle (fails closed)", currentBenefitCycle(billing("active", end), null, at("2026-10-20")) === null);
check("before start: no cycle", currentBenefitCycle(billing("active", end), start, at("2026-10-14")) === null);
// Madrid midnight boundary: 23:30 Madrid on the 14th Nov is still cycle 0 of a 3-month plan; 00:30 on the 15th is cycle 1.
const q = billing("active", at("2027-01-15"));
check("Madrid midnight: 23:30 before boundary is cycle 0", currentBenefitCycle(q, start, new Date("2026-11-14T23:30:00+01:00"))?.index === 0);
check("Madrid midnight: 00:30 after boundary is cycle 1", currentBenefitCycle(q, start, new Date("2026-11-15T00:30:00+01:00"))?.index === 1);
// Month-end anchor: a subscription started Jan 31 gets Feb 28 then Mar 31.
const jan = at("2027-01-31");
const six = billing("active", at("2027-07-31"));
check("month-end anchor: Feb cycle starts Feb 28", currentBenefitCycle(six, jan, at("2027-03-01"))?.start === "2027-02-28");
check("month-end anchor: Mar cycle starts Mar 31", currentBenefitCycle(six, jan, at("2027-03-31"))?.start === "2027-03-31");
check("month-end anchor: Mar 30 is still the Feb cycle", currentBenefitCycle(six, jan, at("2027-03-30"))?.index === 1);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
