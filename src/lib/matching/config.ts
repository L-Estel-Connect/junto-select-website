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
 * Deterministic cycleId for the automatic monthly production run, derived
 * from the CALENDAR month in Europe/Madrid — deliberately independent of
 * any member's Stripe billing/renewal date (see README "Monthly matching
 * engine vs. billing renewal — never conflate the two"). Computed via
 * Intl.DateTimeFormat rather than `date.getUTCMonth()`/`getMonth()` so the
 * boundary is correct in Madrid local time (CET/CEST) even though the
 * server itself runs in UTC — a naive UTC-based check would flip a day
 * early or late around the month boundary depending on the time of year's
 * DST offset. Every call within the same Madrid calendar month returns
 * the same id, which is what makes re-triggering the scheduled endpoint
 * (a retry, or an accidental duplicate trigger) a safe no-op/resume
 * rather than a second cycle for the same month — see runMatchingCycle's
 * own "a cycleId already `completed` is a pure no-op" guarantee.
 */
export function monthlyProductionCycleId(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `monthly-${year}-${month}`;
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
