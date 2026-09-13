/**
 * Hard invariant, deliberately a plain exported constant rather than a
 * field inside CycleConfig: "never more than 3 proposals per member per
 * cycle" must not be something a config object, an API caller, or a future
 * admin UI could accidentally set to 4. engine.ts imports this directly
 * into the transaction that enforces it.
 */
export const MAX_PROPOSALS_PER_MEMBER = 3;

/** Minimum time a pair proposed to each other must wait after a Pass. */
export const PASS_COOLDOWN_MONTHS = 6;

/** A "claimed" memberRun older than this is considered stale/crashed and reclaimable. */
export const MEMBER_RUN_STALE_MINUTES = 30;

/**
 * Wall-clock budget for a single invocation of a `production`-mode
 * (the real monthly-scheduled) cycle, so one HTTP request handler never
 * risks running into the platform's own request timeout while working
 * through a large eligible-member population. When exceeded, the
 * processing loop in engine.ts simply stops and leaves the cycle
 * `running` (not `completed`) — the next scheduled invocation of the SAME
 * cycleId resumes exactly where it left off via the existing per-member
 * claim/skip logic, so hitting this repeatedly is safe and never causes
 * duplicate work. Conservative relative to Cloud Run's commonly-used
 * default request timeout (300s) — see the Cloud Scheduler setup
 * recommendation for pairing this with a short retry interval so a large
 * population still converges to fully processed within the same day.
 */
export const PRODUCTION_CYCLE_TIME_BUDGET_MS = 4 * 60 * 1000;

export const DEFAULT_CYCLE_CONFIG = {
  maxMembersPerRun: 50,
  maxCandidatesPerMember: 200,
  qualityThreshold: 55,
  scoringVersion: 1,
} as const;

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

/**
 * Reads a Date's Y/M/D as they fall in Europe/Madrid civil time — the
 * basis for every date computation below. Stripe timestamps are UTC; a
 * member's own sense of "which day I subscribed on" is the Madrid date,
 * which can differ from the UTC date near midnight (e.g. 23:30 UTC in
 * October, Madrid CEST = UTC+2, is already the next day locally).
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

/** Number of days in a given Y/M (1-indexed month), leap years included via JS's own Date rollover. */
function daysInMonth(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

/**
 * Deterministic per-member matching-period anchor date. `periodsElapsed=0`
 * is the anchor day itself (the day the member's continuous subscription
 * started, per `subscription.start_date` — see the webhook); each
 * increment adds exactly one month to the ORIGINAL anchor day, clamped to
 * the target month's actual length — the same convention Stripe itself
 * uses for its own monthly billing anchors, so it never compounds drift
 * from a previously-clamped short month. A member who starts 31 January:
 * period 1 = 28 Feb (or 29 in a leap year) — the clamped last day of
 * February — but period 2 is 31 March, NOT 28 March: it re-targets the
 * original day-of-month (31) against March's own length, not February's
 * clamped result. Returned at UTC midnight of the resulting Madrid
 * calendar date — callers needing a precise instant (e.g. a Firestore
 * range query boundary) should treat this as "on or after this date, in
 * Europe/Madrid".
 */
export function matchingPeriodDate(anchor: Date, periodsElapsed: number): Date {
  const { year, month, day } = madridYMD(anchor);
  const targetMonthIndex0 = month - 1 + periodsElapsed; // 0-indexed, may exceed 11
  const targetYear = year + Math.floor(targetMonthIndex0 / 12);
  const targetMonth1To12 = (((targetMonthIndex0 % 12) + 12) % 12) + 1;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth1To12));
  return new Date(Date.UTC(targetYear, targetMonth1To12 - 1, clampedDay));
}

/**
 * Deterministic id for one member's one matching period — the idempotency
 * key that makes "the same member can never receive two allowances for
 * the same period" hold regardless of how many times or how many days
 * late the due-scanner processes them. Keyed by the period's own
 * calendar date (Madrid, YYYY-MM-DD), not by whatever day the scanner
 * actually ran on.
 */
export function matchingPeriodId(personId: string, periodDate: Date): string {
  const { year, month, day } = madridYMD(periodDate);
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `anniv_${personId}_${y}-${m}-${d}`;
}

/** Canonical, order-independent id for a pair — the same doc regardless of who proposed to whom. */
export function pairKey(personIdA: string, personIdB: string): string {
  const [low, high] = [personIdA, personIdB].sort();
  return `${low}_${high}`;
}

export function proposalId(
  cycleId: string,
  recipientPersonId: string,
  candidatePersonId: string,
): string {
  return `${cycleId}_${recipientPersonId}_${candidatePersonId}`;
}

/**
 * Reserved cycleId for admin/founder manual suggestions (see
 * manualSuggestion.ts) — deliberately never a real document in
 * `matchingCycles`, so the Matching Cycles admin screen (which lists that
 * collection) never shows it as a cycle, and so nothing here touches the
 * per-cycle memberRun proposalCount that enforces the algorithmic max-3 —
 * a manual suggestion is structurally outside that mechanism, not merely
 * exempted from it by a conditional check.
 */
export const MANUAL_SUGGESTION_CYCLE_ID = "manual";

/**
 * Deterministic id for a manual suggestion, keyed by the unordered pair —
 * same pattern as pairKey/proposalId elsewhere. This is what makes "never
 * allow repeated manual pushing of the same person" and "prevent duplicate
 * active proposals for the same pair" the same guarantee: a second attempt
 * at suggesting the same two people to each other resolves to the same
 * document id and is refused as already existing, not written twice.
 */
export function manualProposalId(personIdA: string, personIdB: string): string {
  return `${MANUAL_SUGGESTION_CYCLE_ID}_${pairKey(personIdA, personIdB)}`;
}
