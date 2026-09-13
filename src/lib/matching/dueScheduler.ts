import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { ProfileDocument } from "@/lib/introduction/types";
import { resolvePersonId } from "./identity";
import { runMatchingCycle } from "./engine";
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
  const snap = await adminDb
    .collection("profiles")
    .where("meta.searchStatus", "==", "active_search")
    .where("meta.nextMatchingDueAt", "<=", now)
    .limit(DUE_SCAN_BATCH_SIZE)
    .get();

  const result: DueScanResult = {
    membersDue: snap.size,
    membersAdvanced: 0,
    membersRetryPending: 0,
    proposalsCreated: 0,
    membersWithZeroProposals: 0,
    errors: 0,
  };

  for (const doc of snap.docs) {
    const uid = doc.id;
    const profile = doc.data() as ProfileDocument;
    const personId = resolvePersonId(uid, profile);
    const periodDate = toDate(profile.meta.nextMatchingDueAt);
    const anchor = toDate(profile.meta.matchingAnchorAt);
    // Shouldn't happen given the query (both fields are set together by
    // the webhook), but never trust stored data blindly — skip rather
    // than crash the whole scan over one malformed profile.
    if (!periodDate || !anchor) continue;

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

        const periodsProcessed = (profile.meta.matchingPeriodsProcessed ?? 0) + 1;
        const nextDue = matchingPeriodDate(anchor, periodsProcessed);
        await doc.ref.update({
          "meta.matchingPeriodsProcessed": periodsProcessed,
          "meta.nextMatchingDueAt": nextDue,
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

  return result;
}
