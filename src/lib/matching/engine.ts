import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { ProfileDocument } from "@/lib/introduction/types";
import { withProfileDefaults } from "@/lib/introduction/types";
import { resolvePersonId } from "./identity";
import { isProfileInEligiblePool } from "./eligibility";
import { evaluateHardFilters } from "./hardFilters";
import { scorePair, SCORING_VERSION } from "./scoring";
import type { ScoreResult } from "./scoring";
import { getPairEligibility, markPairPendingInTransaction } from "./pairHistory";
import {
  DEFAULT_CYCLE_CONFIG,
  MAX_PROPOSALS_PER_MEMBER,
  MEMBER_RUN_STALE_MINUTES,
  PRODUCTION_CYCLE_TIME_BUDGET_MS,
  proposalId,
} from "./config";
import type {
  CycleConfig,
  CycleMode,
  HardFilterFailureReason,
  MatchingCycleDocument,
  MemberRunDiagnostics,
  MemberRunDocument,
  PairHistoryExclusionReason,
} from "./types";

/**
 * V1 deterministic matching engine. Order is fixed and never overridable
 * by scoring, quota pressure, or any future learned behavior:
 *
 *   1. Hard requirements (reciprocal — see hardFilters.ts)
 *   2. Structured scoring (deterministic, versioned — see scoring.ts)
 *   3. Minimum-quality threshold (config.qualityThreshold)
 *   4. Maximum 3 final proposals (MAX_PROPOSALS_PER_MEMBER, config.ts)
 *
 * Every write that matters (a proposal, the memberRun counter it depends
 * on, and the pairHistory entry it creates) happens inside one Firestore
 * transaction per candidate, keyed by deterministic document IDs — that's
 * what makes rerunning the same cycle, or two concurrent invocations of
 * it, safe: retries and duplicates become no-ops rather than duplicate
 * proposals or a count above 3.
 */

export interface EligibleProfile {
  uid: string;
  personId: string;
  profile: ProfileDocument;
}

/**
 * The full Madrid-eligible, non-duplicate pool of unique people — exported
 * (in addition to being used by runMatchingCycle below) so the admin
 * dashboard's manual-suggestion search can offer the same candidate pool
 * the algorithm itself draws from, rather than a separate ad hoc query.
 */
export async function loadEligiblePool(): Promise<EligibleProfile[]> {
  const snap = await adminDb
    .collection("profiles")
    .where("meta.profileStatus", "==", "active_for_matching")
    .get();

  // Group by personId so a duplicate/linked pair of accounts can never
  // occupy two slots in the pool — the engine operates on unique people,
  // not unique uids. First profile seen for a personId wins; this only
  // matters once a real merge exists (personId defaults to uid otherwise).
  const byPersonId = new Map<string, EligibleProfile>();
  for (const doc of snap.docs) {
    const uid = doc.id;
    // Legacy documents predating a schema field (preferences, matching
    // anchors, etc.) are backfilled with safe empty defaults here — the
    // ONLY normalization point for the engine's raw Firestore reads — so a
    // single incomplete candidate can never throw and take down another
    // recipient's entire matching run (see hardFilters.ts/scoring.ts, which
    // both assume every sub-object is present).
    const profile = withProfileDefaults(uid, doc.data() as Partial<ProfileDocument>);
    // profileStatus is already filtered by the query above; this also
    // covers duplicate exclusion and the Madrid-only pool gate — see
    // eligibility.ts (shared with manualSuggestion.ts, so both draw from
    // the exact same definition of "in the pool").
    if (!isProfileInEligiblePool(profile)) continue;
    const personId = resolvePersonId(uid, profile);
    if (!byPersonId.has(personId)) {
      byPersonId.set(personId, { uid, personId, profile });
    }
  }
  return Array.from(byPersonId.values());
}

function selectRecipients(
  pool: EligibleProfile[],
  mode: CycleMode,
  config: CycleConfig,
): EligibleProfile[] {
  let recipients = pool.filter((p) => p.profile.meta.searchStatus === "active_search");

  if (
    (mode === "allowlist" || mode === "dry_run" || mode === "member_period") &&
    config.allowlistPersonIds
  ) {
    const allow = new Set(config.allowlistPersonIds);
    recipients = recipients.filter((p) => allow.has(p.personId));
  }

  // `production` is the manual/administrative "run for the whole
  // active_search pool right now" tool: it must be able to reach every
  // eligible member, however many there are, not just the first
  // `maxMembersPerRun`. `loadEligiblePool`'s query has no explicit
  // orderBy, so Firestore returns it in a stable document-ID order;
  // slicing here would otherwise select the SAME first N members on every
  // retry, never making progress past them. See runMatchingCycle's
  // time-budget loop below for how a large population is still processed
  // safely within one invocation. Every other mode keeps its existing
  // bounded-rollout safety valve (dry_run/allowlist/limited_live) — and
  // member_period, which always resolves to exactly one recipient —
  // unchanged.
  if (mode === "production") return recipients;

  return recipients.slice(0, config.maxMembersPerRun);
}

/**
 * Idempotent claim of one member's slot in this cycle. Returns "claimed"
 * if this call should (re)process the member now, or "skip" if someone
 * already completed it, or another attempt is actively claimed and not
 * yet stale. A `claimed` run older than MEMBER_RUN_STALE_MINUTES is
 * treated as crashed and reclaimed — this is the crash-recovery path.
 */
async function claimMemberRun(
  cycleId: string,
  personId: string,
): Promise<"claimed" | "skip"> {
  const ref = adminDb.doc(`matchingCycles/${cycleId}/memberRuns/${personId}`);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = FieldValue.serverTimestamp();

    if (!snap.exists) {
      tx.set(ref, {
        personId,
        status: "claimed",
        claimedAt: now,
        completedAt: null,
        proposalCount: 0,
        candidateCount: 0,
        error: null,
      });
      return "claimed";
    }

    const data = snap.data() as MemberRunDocument;
    if (data.status === "completed") return "skip";

    if (data.status === "claimed") {
      const claimedAt = data.claimedAt as unknown as Timestamp | null;
      const staleMs = MEMBER_RUN_STALE_MINUTES * 60 * 1000;
      const isStale = !claimedAt || Date.now() - claimedAt.toDate().getTime() >= staleMs;
      if (!isStale) return "skip";
    }

    // failed, or stale "claimed" (crashed mid-run) — reclaim and retry.
    tx.update(ref, { status: "claimed", claimedAt: now, error: null });
    return "claimed";
  });
}

async function writeProposalIfRoom(
  cycleId: string,
  recipient: EligibleProfile,
  candidate: EligibleProfile,
  result: ScoreResult,
): Promise<boolean> {
  const id = proposalId(cycleId, recipient.personId, candidate.personId);
  const proposalRef = adminDb.doc(`proposals/${id}`);
  const memberRunRef = adminDb.doc(`matchingCycles/${cycleId}/memberRuns/${recipient.personId}`);

  return adminDb.runTransaction(async (tx) => {
    const [proposalSnap, memberRunSnap] = await Promise.all([
      tx.get(proposalRef),
      tx.get(memberRunRef),
    ]);

    // Deterministic ID means a retry that already succeeded is a no-op.
    if (proposalSnap.exists) return false;

    const memberRun = memberRunSnap.exists ? (memberRunSnap.data() as MemberRunDocument) : null;
    const currentCount = memberRun?.proposalCount ?? 0;

    // The one place the hard "never a 4th proposal" invariant is actually
    // enforced against concurrency: this read-then-write happens inside a
    // transaction, so two racing attempts cannot both observe count < 3
    // and both proceed — Firestore serializes/retries the conflicting one.
    if (currentCount >= MAX_PROPOSALS_PER_MEMBER) return false;

    const now = FieldValue.serverTimestamp();
    tx.set(proposalRef, {
      cycleId,
      recipientPersonId: recipient.personId,
      candidatePersonId: candidate.personId,
      recipientUid: recipient.uid,
      candidateUid: candidate.uid,
      score: result.score,
      scoringVersion: SCORING_VERSION,
      scoreCoverage: result.coverage,
      scoreConfidence: result.confidence,
      scoreBreakdown: result.breakdown,
      source: "algorithm",
      adminSuggestion: null,
      stage: "proposed",
      passType: null,
      createdAt: now,
      viewedAt: null,
      decidedAt: null,
      updatedAt: now,
    });
    tx.update(memberRunRef, { proposalCount: FieldValue.increment(1) });
    markPairPendingInTransaction(tx, recipient.personId, candidate.personId, cycleId);
    return true;
  });
}

function incrementReason<T extends string>(bucket: Partial<Record<T, number>>, reason: T): void {
  bucket[reason] = (bucket[reason] ?? 0) + 1;
}

async function processRecipient(
  cycleId: string,
  recipient: EligibleProfile,
  pool: EligibleProfile[],
  config: CycleConfig,
  mode: CycleMode,
): Promise<number> {
  const otherPeople = pool.filter((p) => p.personId !== recipient.personId);
  const capped = otherPeople.slice(0, config.maxCandidatesPerMember);

  // 1. Hard requirements first — never overridable by scoring below. Every
  // exclusion here is also tallied into an aggregate (never per-candidate)
  // reason count — see MemberRunDiagnostics — so a zero-selection outcome
  // can be explained later without a per-candidate rejection log.
  const hardFilterExcluded: Partial<Record<HardFilterFailureReason, number>> = {};
  const pairHistoryExcluded: Partial<Record<PairHistoryExclusionReason, number>> = {};
  const passingHard: EligibleProfile[] = [];
  for (const candidate of capped) {
    const { passes, failureReason } = evaluateHardFilters(recipient.profile, candidate.profile);
    if (!passes) {
      incrementReason(hardFilterExcluded, failureReason as HardFilterFailureReason);
      continue;
    }
    const { eligible, reason } = await getPairEligibility(recipient.personId, candidate.personId);
    if (!eligible) {
      incrementReason(pairHistoryExcluded, reason as PairHistoryExclusionReason);
      continue;
    }
    passingHard.push(candidate);
  }

  // 2. Structured scoring for every hard-filter survivor (not just the
  // eventual top 3) — needed so diagnostics can report "above threshold"
  // and "highest score seen" even when the eventual proposal count is 0.
  const scored = passingHard.map((candidate) => ({
    candidate,
    result: scorePair(recipient.profile, candidate.profile),
  }));

  // 3. Minimum-quality threshold.
  const aboveThreshold = scored
    .filter(({ result }) => result.score >= config.qualityThreshold)
    .sort((a, b) => b.result.score - a.result.score);

  // 4. Maximum 3 — quality over quota: fewer than 3 (even 0) is valid, and
  // this cap is never relaxed to "reach" 3.
  const qualified = aboveThreshold.slice(0, MAX_PROPOSALS_PER_MEMBER);

  const diagnostics: MemberRunDiagnostics = {
    candidatePoolSize: capped.length,
    hardFilterExcluded,
    pairHistoryExcluded,
    hardFilterSurvivors: passingHard.length,
    aboveQualityThreshold: aboveThreshold.length,
    highestScore: scored.length > 0 ? Math.max(...scored.map((s) => s.result.score)) : null,
  };

  const memberRunRef = adminDb.doc(`matchingCycles/${cycleId}/memberRuns/${recipient.personId}`);

  if (mode === "dry_run") {
    // No real proposals or pairHistory writes — just the computed outcome,
    // for safe inspection before anything member-facing is created.
    await memberRunRef.update({
      status: "completed",
      completedAt: FieldValue.serverTimestamp(),
      candidateCount: passingHard.length,
      proposalCount: qualified.length,
      diagnostics,
    });
    return qualified.length;
  }

  let written = 0;
  for (const { candidate, result } of qualified) {
    if (await writeProposalIfRoom(cycleId, recipient, candidate, result)) written += 1;
  }

  await memberRunRef.update({
    status: "completed",
    completedAt: FieldValue.serverTimestamp(),
    candidateCount: passingHard.length,
    diagnostics,
  });

  return written;
}

/**
 * Runs (or resumes) one monthly matching cycle. Idempotent at every level:
 * a cycleId already `completed` is a pure no-op; a partially-run cycle
 * (crash, or a duplicate trigger firing concurrently) resumes by skipping
 * completed memberRuns and reclaiming stale/failed ones; every proposal
 * write is itself idempotent via its deterministic id.
 */
export async function runMatchingCycle(
  cycleId: string,
  mode: CycleMode,
  overrides: Partial<CycleConfig> = {},
): Promise<MatchingCycleDocument> {
  const cycleRef = adminDb.doc(`matchingCycles/${cycleId}`);
  const existingSnap = await cycleRef.get();

  let cycle: MatchingCycleDocument;
  if (existingSnap.exists) {
    cycle = existingSnap.data() as MatchingCycleDocument;
    if (cycle.status === "completed") return cycle;
    await cycleRef.update({ status: "running" });
  } else {
    const config: CycleConfig = { ...DEFAULT_CYCLE_CONFIG, ...overrides, scoringVersion: SCORING_VERSION };
    cycle = {
      id: cycleId,
      mode,
      status: "running",
      config,
      createdAt: FieldValue.serverTimestamp(),
      startedAt: FieldValue.serverTimestamp(),
      completedAt: null,
      stats: {
        recipientsConsidered: 0,
        recipientsCompleted: 0,
        proposalsCreated: 0,
        recipientsWithZeroProposals: 0,
      },
      error: null,
    };
    await cycleRef.set(cycle);
  }

  const pool = await loadEligiblePool();
  const recipients = selectRecipients(pool, cycle.mode, cycle.config);

  let proposalsCreated = 0;
  let recipientsCompleted = 0;
  let recipientsWithZeroProposals = 0;
  let recipientsFailed = 0;
  let timeBudgetExceeded = false;
  const invocationStartedAt = Date.now();

  for (const recipient of recipients) {
    // Only `production` (the real monthly-scheduled run, potentially
    // hundreds/thousands of members) ever needs to stop early — every
    // other mode is already bounded by maxMembersPerRun and reliably
    // completes in one invocation, exactly as already tested.
    if (
      cycle.mode === "production" &&
      Date.now() - invocationStartedAt > PRODUCTION_CYCLE_TIME_BUDGET_MS
    ) {
      timeBudgetExceeded = true;
      break;
    }

    const claim = await claimMemberRun(cycleId, recipient.personId);
    if (claim === "skip") continue;

    try {
      const count = await processRecipient(cycleId, recipient, pool, cycle.config, cycle.mode);
      proposalsCreated += count;
      recipientsCompleted += 1;
      if (count === 0) recipientsWithZeroProposals += 1;
    } catch (error) {
      console.error(`Matching cycle ${cycleId}: recipient ${recipient.personId} failed`, error);
      await adminDb
        .doc(`matchingCycles/${cycleId}/memberRuns/${recipient.personId}`)
        .update({ status: "failed", error: String(error) })
        .catch(() => {});
      recipientsFailed += 1;
      // Continue with the rest of the cycle — one member's failure must
      // never block everyone else's proposals for this cycle.
    }
  }

  // Stats accumulate via FieldValue.increment rather than being
  // overwritten: for every existing (non-production) mode this produces
  // the exact same final numbers as a flat set, since those cycles always
  // complete in a single invocation starting from 0 — but it's also what
  // makes a `production` cycle resumed across several scheduled
  // invocations report a running TOTAL rather than only its most recent
  // partial invocation's count.
  if (timeBudgetExceeded || recipientsFailed > 0) {
    // Deliberately NOT marked "completed" — the next invocation of this
    // same cycleId (whether the next scheduled time budget continuation,
    // or the due-scheduler retrying a member whose period never advanced
    // because its memberRun didn't reach "completed") resumes it, skipping
    // everyone already `completed` above and reclaiming anyone `failed`
    // via claimMemberRun. A single-recipient cycle (member_period/allowlist
    // due-scan mode) whose only recipient's run failed must NEVER be
    // marked "completed" at this cycle level — that would freeze this
    // cycleId as permanently done and this member's matching period would
    // never actually be (re)computed, even though the due-scheduler keeps
    // presenting it as due (see dueScheduler.ts, which only advances
    // nextMatchingDueAt once the memberRun itself reaches "completed").
    await cycleRef.update({
      "stats.recipientsConsidered": recipients.length,
      "stats.recipientsCompleted": FieldValue.increment(recipientsCompleted),
      "stats.proposalsCreated": FieldValue.increment(proposalsCreated),
      "stats.recipientsWithZeroProposals": FieldValue.increment(recipientsWithZeroProposals),
    });
    const partialSnap = await cycleRef.get();
    return partialSnap.data() as MatchingCycleDocument;
  }

  await cycleRef.update({
    status: "completed",
    completedAt: FieldValue.serverTimestamp(),
    "stats.recipientsConsidered": recipients.length,
    "stats.recipientsCompleted": FieldValue.increment(recipientsCompleted),
    "stats.proposalsCreated": FieldValue.increment(proposalsCreated),
    "stats.recipientsWithZeroProposals": FieldValue.increment(recipientsWithZeroProposals),
  });

  const finalSnap = await cycleRef.get();
  return finalSnap.data() as MatchingCycleDocument;
}
