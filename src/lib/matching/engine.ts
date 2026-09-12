import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { ProfileDocument } from "@/lib/introduction/types";
import { resolvePersonId } from "./identity";
import { passesHardFilters } from "./hardFilters";
import { scorePair, SCORING_VERSION } from "./scoring";
import { isPairEligible, markPairPendingInTransaction } from "./pairHistory";
import {
  DEFAULT_CYCLE_CONFIG,
  MAX_PROPOSALS_PER_MEMBER,
  MEMBER_RUN_STALE_MINUTES,
  proposalId,
} from "./config";
import type {
  CycleConfig,
  CycleMode,
  MatchingCycleDocument,
  MemberRunDocument,
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

interface EligibleProfile {
  uid: string;
  personId: string;
  profile: ProfileDocument;
}

async function loadEligiblePool(): Promise<EligibleProfile[]> {
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
    const profile = doc.data() as ProfileDocument;
    if (
      profile.meta.duplicateStatus === "suspected" ||
      profile.meta.duplicateStatus === "confirmed_duplicate"
    ) {
      continue;
    }
    // V1 product scope: Madrid only. `market` is a constant today (see
    // AboutMeVisible.market) — checked explicitly anyway so this is the
    // one line that needs to change once a second market exists, rather
    // than a schema migration. Unknown availability is excluded, same as
    // any other unknown self-report data — never assumed compatible.
    if (
      profile.visible.market !== "madrid" ||
      profile.visible.marketAvailability == null ||
      profile.visible.marketAvailability === "not_regular_in_market"
    ) {
      continue;
    }
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

  if ((mode === "allowlist" || mode === "dry_run") && config.allowlistPersonIds) {
    const allow = new Set(config.allowlistPersonIds);
    recipients = recipients.filter((p) => allow.has(p.personId));
  }

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
  score: number,
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
      score,
      scoringVersion: SCORING_VERSION,
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

async function processRecipient(
  cycleId: string,
  recipient: EligibleProfile,
  pool: EligibleProfile[],
  config: CycleConfig,
  mode: CycleMode,
): Promise<number> {
  const otherPeople = pool.filter((p) => p.personId !== recipient.personId);
  const capped = otherPeople.slice(0, config.maxCandidatesPerMember);

  // 1. Hard requirements first — never overridable by scoring below.
  const passingHard: EligibleProfile[] = [];
  for (const candidate of capped) {
    if (!passesHardFilters(recipient.profile, candidate.profile)) continue;
    if (!(await isPairEligible(recipient.personId, candidate.personId))) continue;
    passingHard.push(candidate);
  }

  // 2 & 3. Structured scoring, then the minimum-quality threshold.
  const qualified = passingHard
    .map((candidate) => ({ candidate, score: scorePair(recipient.profile, candidate.profile) }))
    .filter(({ score }) => score >= config.qualityThreshold)
    .sort((a, b) => b.score - a.score)
    // 4. Maximum 3 — quality over quota: fewer than 3 (even 0) is valid,
    // and this cap is never relaxed to "reach" 3.
    .slice(0, MAX_PROPOSALS_PER_MEMBER);

  const memberRunRef = adminDb.doc(`matchingCycles/${cycleId}/memberRuns/${recipient.personId}`);

  if (mode === "dry_run") {
    // No real proposals or pairHistory writes — just the computed outcome,
    // for safe inspection before anything member-facing is created.
    await memberRunRef.update({
      status: "completed",
      completedAt: FieldValue.serverTimestamp(),
      candidateCount: passingHard.length,
      proposalCount: qualified.length,
    });
    return qualified.length;
  }

  let written = 0;
  for (const { candidate, score } of qualified) {
    if (await writeProposalIfRoom(cycleId, recipient, candidate, score)) written += 1;
  }

  await memberRunRef.update({
    status: "completed",
    completedAt: FieldValue.serverTimestamp(),
    candidateCount: passingHard.length,
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

  for (const recipient of recipients) {
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
      // Continue with the rest of the cycle — one member's failure must
      // never block everyone else's proposals for this cycle.
    }
  }

  await cycleRef.update({
    status: "completed",
    completedAt: FieldValue.serverTimestamp(),
    "stats.recipientsConsidered": recipients.length,
    "stats.recipientsCompleted": recipientsCompleted,
    "stats.proposalsCreated": proposalsCreated,
    "stats.recipientsWithZeroProposals": recipientsWithZeroProposals,
  });

  const finalSnap = await cycleRef.get();
  return finalSnap.data() as MatchingCycleDocument;
}
