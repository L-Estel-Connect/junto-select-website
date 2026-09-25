import "server-only";

/**
 * Deliberately a standalone copy of the same Madrid-calendar, clamped
 * month-add logic as matching/config.ts's matchingPeriodDate — NOT an
 * import from there. The event benefit's monthly cadence is a separate,
 * dedicated lifecycle (its own anchor fields on billing/{uid}, its own
 * scheduler) precisely so it can never accidentally couple to matching's
 * own state or get dragged along by a future change to matching's
 * cadence. The ~15 lines of shared math are small and stable enough that
 * duplicating them here is cheaper than the coupling would be.
 */
function madridYMD(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function daysInMonth(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

/**
 * `periodsElapsed=0` is the anchor day itself (the subscription's own
 * `start_date`); each increment adds one month to the ORIGINAL anchor
 * day, clamped to the target month's length — see matchingPeriodDate's
 * own doc comment for the full rationale (identical logic here).
 */
export function eventBenefitPeriodDate(anchor: Date, periodsElapsed: number): Date {
  const { year, month, day } = madridYMD(anchor);
  const targetMonthIndex0 = month - 1 + periodsElapsed;
  const targetYear = year + Math.floor(targetMonthIndex0 / 12);
  const targetMonth1To12 = (((targetMonthIndex0 % 12) + 12) % 12) + 1;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth1To12));
  return new Date(Date.UTC(targetYear, targetMonth1To12 - 1, clampedDay));
}

/**
 * The idempotency key for one subscription's one monthly benefit cycle —
 * also used directly as the `eventBenefits` Firestore document ID (see
 * lifecycle.ts), which is what makes "never grant the same cycle twice"
 * an enforced property rather than a convention: a second attempt to
 * create the same doc ID fails atomically.
 */
export function eventBenefitCycleKey(stripeSubscriptionId: string, periodIndex: number): string {
  return `${stripeSubscriptionId}:${periodIndex}`;
}
