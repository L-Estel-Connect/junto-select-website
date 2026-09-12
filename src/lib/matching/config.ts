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
