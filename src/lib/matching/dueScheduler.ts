import "server-only";
import { AUTOMATIC_INTRODUCTIONS_ENABLED } from "./automaticIntroductions";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { ProfileDocument } from "@/lib/introduction/types";
import { withProfileDefaults } from "@/lib/introduction/types";
import { resolvePersonId } from "./identity";
import { runMatchingCycle } from "./engine";
import { isEligibleForActiveSearch } from "./activeSearch";
import { matchingPeriodDate, matchingPeriodId } from "./config";
import type { MemberRunDocument } from "./types";

/**
 * Bounds how many due members one invocation processes — "do not simply
 * load an unlimited future database into memory." Each unit of work here
 * is cheap (one recipient against the existing candidate pool, the same
 * per-member cost the old bounded rollout modes already budgeted for), so
 * this can be generous; if more than this many are due in a single scan,
 * the rest are simply picked up on the NEXT scheduled invocation — safe,
 * because "due" is a standing condition, never a point-in-time event that
 * could be missed (see the recovery behavior below).
 */
const DUE_SCAN_BATCH_SIZE = 500;

export interface DueScanResult {
  /** How many active_search members had a period due at scan time (bounded by DUE_SCAN_BATCH_SIZE). */
  membersDue: number;
  /** Successfully completed this scan (their period is now advanced). */
  membersAdvanced: number;
  /** Due, but not yet completed (transient failure or still mid-run) — retried automatically on the next scan. */
  membersRetryPending: number;
  /** Paying, but not yet eligible (profile not finalized or not in the pool) — paused, retried on every scan. */
  membersIneligible: number;
  /** Were paused and are eligible again — restarted at their current period (no backlog replay). */
  membersResumed: number;
  proposalsCreated: number;
  membersWithZeroProposals: number;
  errors: number;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

/**
 * The automatic per-member matching scheduler. Finds every active_search
 * member whose next matching period is due (`meta.nextMatchingDueAt <=
 * now`, written by the Stripe webhook and advanced here — see
 * ProfileDocument's matchingAnchorAt/matchingPeriodsProcessed/
 * nextMatchingDueAt fields for the full anchor model) and processes
 * exactly ONE period for each, via the existing, already-tested
 * `runMatchingCycle` in `member_period` mode — this function adds no new
 * matching/scoring logic of its own, only the due-date bookkeeping around
 * calling it.
 *
 * Idempotency: the cycleId for a member's period (`matchingPeriodId`) is
 * derived purely from their personId and that period's own calendar date
 * — never from when the scan happens to run. Calling this function twice
 * (a scheduler retry, an overlapping invocation, a manual re-trigger)
 * resolves to the exact same cycleId per due member, and
 * `runMatchingCycle` already treats a `completed` cycle as a pure no-op —
 * so a member can never receive two allowances for the same period.
 *
 * Recovery (deliberate): a member overdue by more than one period (e.g.
 * after a multi-day scheduler outage) only ever has ONE period advanced
 * per scan call — never several at once, and never skipped. They simply
 * remain "due" (their `nextMatchingDueAt` is untouched until a period
 * actually completes) and are picked up again on the very next scan,
 * catching up one period at a time rather than bursting several months
 * of proposals into a single run.
 */
export async function runDueMatchingScan(now: Date = new Date()): Promise<DueScanResult> {
  // Switched off: the scheduled job still answers, with nothing done.
  if (!AUTOMATIC_INTRODUCTIONS_ENABLED) return emptyResult(0);
  const snap = await adminDb
    .collection("profiles")
    .where("meta.searchStatus", "==", "active_search")
    .where("meta.nextMatchingDueAt", "<=", now)
    .limit(DUE_SCAN_BATCH_SIZE)
    .get();

  const result = emptyResult(snap.size);
  for (const doc of snap.docs) {
    await processDueProfile(doc, now, result);
  }
  return result;
}

/**
 * Re-evaluates ONE member right away, e.g. the moment they finalize their
 * Introductions profile after having paid first. Same rules and same
 * idempotency as the scan above (it calls the exact same per-member step);
 * a member who isn't paying, or whose period isn't due, is a no-op.
 */
export async function runDueMatchingForUid(uid: string, now: Date = new Date()): Promise<DueScanResult> {
  if (!AUTOMATIC_INTRODUCTIONS_ENABLED) return emptyResult(0);
  const snap = await adminDb.doc(`profiles/${uid}`).get();
  if (!snap.exists) return emptyResult(0);
  const profile = snap.data() as ProfileDocument;
  const dueAt = toDate(profile.meta?.nextMatchingDueAt);
  if (profile.meta?.searchStatus !== "active_search" || !dueAt || dueAt > now) return emptyResult(0);

  const result = emptyResult(1);
  await processDueProfile(snap, now, result);
  return result;
}

function emptyResult(membersDue: number): DueScanResult {
  return {
    membersDue,
    membersAdvanced: 0,
    membersRetryPending: 0,
    membersIneligible: 0,
    membersResumed: 0,
    proposalsCreated: 0,
    membersWithZeroProposals: 0,
    errors: 0,
  };
}

/**
 * The latest period index whose date is on or before `now`, starting from
 * `from`. Used only when a paused member becomes eligible again: their
 * allowance restarts at the current period instead of replaying every
 * month they spent ineligible.
 */
function currentPeriodIndex(anchor: Date, from: number, now: Date): number {
  let n = from;
  while (matchingPeriodDate(anchor, n + 1) <= now) n += 1;
  return n;
}

async function processDueProfile(
  doc: FirebaseFirestore.DocumentSnapshot,
  now: Date,
  result: DueScanResult,
): Promise<void> {
  const uid = doc.id;
  const profile = withProfileDefaults(uid, doc.data() as Partial<ProfileDocument>);
  const personId = resolvePersonId(uid, profile);
  const anchor = toDate(profile.meta.matchingAnchorAt);
  let periodsProcessed = profile.meta.matchingPeriodsProcessed ?? 0;
  let periodDate = toDate(profile.meta.nextMatchingDueAt);
  // Shouldn't happen given the query (both fields are set together by
  // the webhook), but never trust stored data blindly — skip rather
  // than crash the whole scan over one malformed profile.
  if (!periodDate || !anchor) return;

  // Paying is not enough: the member must also have finalized their
  // Introductions profile and be in the eligible pool. Before this check a
  // pay-first member's period ran with nobody to process and froze forever.
  // Now the period simply waits (nextMatchingDueAt untouched) and is marked
  // paused, so finishing the profile later resumes matching.
  if (!isEligibleForActiveSearch(profile)) {
    result.membersIneligible += 1;
    if (!profile.meta.matchingPausedAt) {
      await doc.ref.update({
        "meta.matchingPausedAt": FieldValue.serverTimestamp(),
        "meta.updatedAt": FieldValue.serverTimestamp(),
      });
    }
    return;
  }

  if (profile.meta.matchingPausedAt) {
    const current = currentPeriodIndex(anchor, periodsProcessed, now);
    periodsProcessed = current;
    periodDate = matchingPeriodDate(anchor, current);
    await doc.ref.update({
      "meta.matchingPeriodsProcessed": periodsProcessed,
      "meta.nextMatchingDueAt": periodDate,
      "meta.matchingPausedAt": null,
      "meta.updatedAt": FieldValue.serverTimestamp(),
    });
    result.membersResumed += 1;
    if (periodDate > now) return; // defensive: stored dates disagreed; wait for the period to arrive
  }

  const cycleId = matchingPeriodId(personId, periodDate);

  try {
    const cycle = await runMatchingCycle(cycleId, "member_period", {
      allowlistPersonIds: [personId],
    });
    result.proposalsCreated += cycle.stats.proposalsCreated;

    const runSnap = await adminDb.doc(`matchingCycles/${cycleId}/memberRuns/${personId}`).get();
    const run = runSnap.exists ? (runSnap.data() as MemberRunDocument) : null;

    if (run?.status === "completed") {
      if (run.proposalCount === 0) result.membersWithZeroProposals += 1;

      const nextProcessed = periodsProcessed + 1;
      await doc.ref.update({
        "meta.matchingPeriodsProcessed": nextProcessed,
        "meta.nextMatchingDueAt": matchingPeriodDate(anchor, nextProcessed),
        "meta.updatedAt": FieldValue.serverTimestamp(),
      });
      result.membersAdvanced += 1;
    } else {
      // Not completed (still claimed, or failed) — leave
      // nextMatchingDueAt untouched so the next scan retries this exact
      // period; engine.ts's own claimMemberRun already reclaims a
      // failed or stale-claimed run automatically.
      result.membersRetryPending += 1;
    }
  } catch (error) {
    console.error(`Due matching scan: period ${cycleId} (personId ${personId}) failed`, error);
    result.errors += 1;
  }
}
