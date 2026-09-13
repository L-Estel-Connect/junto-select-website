import "server-only";
import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { addMonths, PASS_COOLDOWN_MONTHS, pairKey } from "./config";
import type {
  InvitationDocument,
  PairHistoryDocument,
  PairHistoryExclusionReason,
  PairHistoryState,
  PassType,
  ProposalDocument,
} from "./types";

function pairHistoryRef(personIdA: string, personIdB: string) {
  return adminDb.doc(`pairHistory/${pairKey(personIdA, personIdB)}`);
}

/**
 * Whether a pair may be freshly PROPOSED right now (i.e. a new selection
 * by the algorithm, or an admin manual suggestion) — not the same question
 * as whether an existing proposal/invitation may proceed to its next
 * stage. Pass -> minimum 6-month cooldown, then eligible again (no
 * automatic "time healed it" upgrade beyond that). `pending`/`invited`
 * (already mid-flow, undecided) and `mutual` (an existing introduction)
 * are never re-proposed. `blocked` is permanent until a human resolves it.
 * `isPairEligible` is a thin boolean-only wrapper, used wherever the reason
 * for exclusion doesn't matter.
 */
/**
 * Pure classifier, extracted so both a single-pair lookup (below) and a
 * batch lookup (manualSuggestion.ts's candidate search, which fetches many
 * pairHistory docs in two queries rather than one `.get()` per candidate)
 * apply the identical rule.
 */
export function classifyPairHistoryState(
  history: PairHistoryDocument | null,
): { eligible: boolean; reason: PairHistoryExclusionReason | null } {
  if (!history) return { eligible: true, reason: null };
  switch (history.state) {
    case "blocked":
      return { eligible: false, reason: "blocked" };
    case "mutual":
      return { eligible: false, reason: "mutual" };
    case "pending":
    case "invited":
      return { eligible: false, reason: "pending_or_invited" };
    case "passed": {
      const cooldownUntil = history.cooldownUntil as Timestamp | null;
      if (!cooldownUntil || Date.now() >= cooldownUntil.toDate().getTime()) {
        return { eligible: true, reason: null };
      }
      return { eligible: false, reason: "cooldown" };
    }
    default:
      return { eligible: true, reason: null };
  }
}

export async function getPairEligibility(
  personIdA: string,
  personIdB: string,
): Promise<{ eligible: boolean; reason: PairHistoryExclusionReason | null }> {
  const snap = await pairHistoryRef(personIdA, personIdB).get();
  return classifyPairHistoryState(snap.exists ? (snap.data() as PairHistoryDocument) : null);
}

export async function isPairEligible(personIdA: string, personIdB: string): Promise<boolean> {
  return (await getPairEligibility(personIdA, personIdB)).eligible;
}

/** Raw pair history, for admin display (pair timeline, cooldown status) — null if the pair has never interacted. */
export async function getPairHistoryDocument(
  personIdA: string,
  personIdB: string,
): Promise<PairHistoryDocument | null> {
  const snap = await pairHistoryRef(personIdA, personIdB).get();
  return snap.exists ? (snap.data() as PairHistoryDocument) : null;
}

/**
 * Every pairHistory doc touching `personId`, fetched in two queries (not
 * one per candidate/pair) and indexed by the OTHER person's personId —
 * shared by manualSuggestion.ts's candidate search and the admin member
 * detail view.
 */
export async function loadPairHistoryMapFor(personId: string): Promise<Map<string, PairHistoryDocument>> {
  const [lowSnap, highSnap] = await Promise.all([
    adminDb.collection("pairHistory").where("personIdLow", "==", personId).get(),
    adminDb.collection("pairHistory").where("personIdHigh", "==", personId).get(),
  ]);
  const map = new Map<string, PairHistoryDocument>();
  for (const doc of [...lowSnap.docs, ...highSnap.docs]) {
    const data = doc.data() as PairHistoryDocument;
    const other = data.personIdLow === personId ? data.personIdHigh : data.personIdLow;
    map.set(other, data);
  }
  return map;
}

/**
 * Every permanently blocked pair — for the admin Review screen. `pairHistory`
 * is expected to stay small at V1 scale (bounded by actual proposed/invited
 * pairs, not the full member-pair combinatorics), so a full collection query
 * filtered by state is the smallest sensible approach; see README §16.
 */
export async function listBlockedPairs(): Promise<PairHistoryDocument[]> {
  const snap = await adminDb.collection("pairHistory").where("state", "==", "blocked").get();
  return snap.docs.map((d) => d.data() as PairHistoryDocument);
}

/**
 * Called from inside the same transaction that writes a new proposal —
 * marks the pair `pending` so it can't be freshly proposed again while
 * this one is undecided. Overwrites a previous `passed` entry once its
 * cooldown has already been checked as expired by the caller.
 */
export function markPairPendingInTransaction(
  tx: Transaction,
  personIdA: string,
  personIdB: string,
  cycleId: string,
): void {
  setPairStateInTransaction(tx, personIdA, personIdB, {
    state: "pending",
    passType: null,
    cooldownUntil: null,
    blockedReason: null,
    lastCycleId: cycleId,
    bumpProposalCount: true,
  });
}

function setPairStateInTransaction(
  tx: Transaction,
  personIdA: string,
  personIdB: string,
  fields: {
    state: PairHistoryState;
    passType: PassType | null;
    cooldownUntil: Timestamp | null;
    blockedReason: string | null;
    lastCycleId?: string;
    bumpProposalCount?: boolean;
  },
): void {
  const ref = pairHistoryRef(personIdA, personIdB);
  const [personIdLow, personIdHigh] = [personIdA, personIdB].sort();
  const now = FieldValue.serverTimestamp();
  tx.set(
    ref,
    {
      personIdLow,
      personIdHigh,
      state: fields.state,
      passType: fields.passType,
      cooldownUntil: fields.cooldownUntil,
      blockedReason: fields.blockedReason,
      ...(fields.lastCycleId ? { lastCycleId: fields.lastCycleId } : {}),
      ...(fields.bumpProposalCount ? { proposalCount: FieldValue.increment(1) } : {}),
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
}

function passCooldown(): Timestamp {
  return Timestamp.fromDate(addMonths(new Date(), PASS_COOLDOWN_MONTHS));
}

/**
 * Stage 1 decision: the active/paid member responds to a proposal.
 * Idempotent — deciding the same way twice is a no-op; deciding
 * differently after an existing decision throws (this must go through an
 * explicit correction path later, not a silent overwrite).
 *
 * "interested" additionally creates the Stage 2 invitation for the
 * (possibly passive/free) candidate — for free, no payment required on
 * their side — in the same transaction, so the two are never
 * inconsistent with each other.
 */
export async function recordMemberDecision(
  proposalId: string,
  decision: "interested" | "passed",
  passType: PassType | null,
): Promise<{ alreadyRecorded: boolean }> {
  const proposalRef = adminDb.doc(`proposals/${proposalId}`);
  const invitationRef = adminDb.doc(`invitations/${proposalId}`);

  return adminDb.runTransaction(async (tx) => {
    const proposalSnap = await tx.get(proposalRef);
    if (!proposalSnap.exists) throw new Error(`proposal ${proposalId} not found`);
    const proposal = proposalSnap.data() as ProposalDocument;

    const targetStage = decision === "interested" ? "member_interested" : "member_passed";
    if (proposal.stage === targetStage) return { alreadyRecorded: true };
    if (proposal.stage !== "proposed" && proposal.stage !== "viewed") {
      throw new Error(`proposal ${proposalId} already decided (${proposal.stage})`);
    }

    // Firestore transactions require every read before any write — read
    // the invitation doc now (even though only the "interested" branch
    // below needs it) so the write(s) that follow are never interleaved
    // with a read.
    const invitationSnap = decision === "interested" ? await tx.get(invitationRef) : null;

    const now = FieldValue.serverTimestamp();
    tx.update(proposalRef, {
      stage: targetStage,
      passType: decision === "passed" ? passType : null,
      decidedAt: now,
      updatedAt: now,
    });

    if (decision === "passed") {
      setPairStateInTransaction(tx, proposal.recipientPersonId, proposal.candidatePersonId, {
        state: "passed",
        passType,
        cooldownUntil: passCooldown(),
        blockedReason: null,
      });
      return { alreadyRecorded: false };
    }

    // "interested" -> create (or no-op if it already exists) the free,
    // no-payment-required invitation for the original candidate.
    if (!invitationSnap?.exists) {
      tx.set(invitationRef, {
        proposalId,
        cycleId: proposal.cycleId,
        recipientPersonId: proposal.candidatePersonId,
        recipientUid: proposal.candidateUid,
        inviterPersonId: proposal.recipientPersonId,
        inviterUid: proposal.recipientUid,
        stage: "invited",
        passType: null,
        createdAt: now,
        viewedAt: null,
        decidedAt: null,
        updatedAt: now,
      } satisfies Omit<InvitationDocument, "createdAt" | "viewedAt" | "decidedAt" | "updatedAt"> & {
        createdAt: unknown;
        viewedAt: unknown;
        decidedAt: unknown;
        updatedAt: unknown;
      });
    }

    setPairStateInTransaction(tx, proposal.recipientPersonId, proposal.candidatePersonId, {
      state: "invited",
      passType: null,
      cooldownUntil: null,
      blockedReason: null,
    });

    return { alreadyRecorded: false };
  });
}

/**
 * Stage 2 decision: the invited (possibly passive/free) candidate
 * responds. Idempotent the same way as recordMemberDecision.
 * "interested" here means BOTH sides have now said Interested — this is
 * the one and only place a mutual introduction is created.
 */
export async function recordCandidateDecision(
  invitationId: string,
  decision: "interested" | "passed",
  passType: PassType | null,
): Promise<{ alreadyRecorded: boolean }> {
  const invitationRef = adminDb.doc(`invitations/${invitationId}`);
  const proposalRef = adminDb.doc(`proposals/${invitationId}`); // same id as the source proposal
  const introductionRef = adminDb.doc(`introductions/${invitationId}`);

  return adminDb.runTransaction(async (tx) => {
    const invitationSnap = await tx.get(invitationRef);
    if (!invitationSnap.exists) throw new Error(`invitation ${invitationId} not found`);
    const invitation = invitationSnap.data() as InvitationDocument;

    const targetStage = decision === "interested" ? "candidate_interested" : "candidate_passed";
    if (invitation.stage === targetStage || invitation.stage === "mutual_interested") {
      return { alreadyRecorded: true };
    }
    if (invitation.stage !== "invited" && invitation.stage !== "viewed") {
      throw new Error(`invitation ${invitationId} already decided (${invitation.stage})`);
    }

    const now = FieldValue.serverTimestamp();

    if (decision === "passed") {
      tx.update(invitationRef, {
        stage: "candidate_passed",
        passType,
        decidedAt: now,
        updatedAt: now,
      });
      setPairStateInTransaction(tx, invitation.inviterPersonId, invitation.recipientPersonId, {
        state: "passed",
        passType,
        cooldownUntil: passCooldown(),
        blockedReason: null,
      });
      return { alreadyRecorded: false };
    }

    // "interested" -> mutual. Flip both proposal and invitation to
    // mutual_interested and create the introduction record. All reads
    // (proposal, introduction) happen before any write below — Firestore
    // transactions require every read before any write.
    const proposalSnap = await tx.get(proposalRef);
    if (!proposalSnap.exists) throw new Error(`proposal ${invitationId} not found for invitation`);
    const proposal = proposalSnap.data() as ProposalDocument;
    const introductionSnap = await tx.get(introductionRef);

    tx.update(invitationRef, {
      stage: "mutual_interested",
      passType: null,
      decidedAt: now,
      updatedAt: now,
    });
    tx.update(proposalRef, {
      stage: "mutual_interested",
      updatedAt: now,
    });

    if (!introductionSnap.exists) {
      tx.set(introductionRef, {
        proposalId: invitationId,
        cycleId: invitation.cycleId,
        personIdA: proposal.recipientPersonId,
        personIdB: proposal.candidatePersonId,
        uidA: proposal.recipientUid,
        uidB: proposal.candidateUid,
        createdAt: now,
        contactRevealedAt: null,
      });
    }

    setPairStateInTransaction(tx, invitation.inviterPersonId, invitation.recipientPersonId, {
      state: "mutual",
      passType: null,
      cooldownUntil: null,
      blockedReason: null,
    });

    return { alreadyRecorded: false };
  });
}

/**
 * Optional telemetry, not a gate: marks a proposal/invitation "viewed" if
 * it's still in its initial stage. No UI calls this yet (Mis propuestas is
 * still a placeholder) — it exists so that funnel analytics (see
 * analytics.ts) has a real field to read once a UI does call it, and so
 * decision-recording never requires having gone through "viewed" first.
 */
export async function recordProposalViewed(proposalId: string): Promise<void> {
  const ref = adminDb.doc(`proposals/${proposalId}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const proposal = snap.data() as ProposalDocument;
  if (proposal.stage !== "proposed") return;
  await ref.update({ stage: "viewed", viewedAt: FieldValue.serverTimestamp() });
}

export async function recordInvitationViewed(invitationId: string): Promise<void> {
  const ref = adminDb.doc(`invitations/${invitationId}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const invitation = snap.data() as InvitationDocument;
  if (invitation.stage !== "invited") return;
  await ref.update({ stage: "viewed", viewedAt: FieldValue.serverTimestamp() });
}

/**
 * Permanent safety / do-not-match exclusion — a human/admin action, never
 * written by the matching engine itself. Overrides any other state.
 */
export async function blockPair(personIdA: string, personIdB: string, reason: string): Promise<void> {
  await pairHistoryRef(personIdA, personIdB).set(
    {
      personIdLow: [personIdA, personIdB].sort()[0],
      personIdHigh: [personIdA, personIdB].sort()[1],
      state: "blocked",
      passType: null,
      cooldownUntil: null,
      blockedReason: reason,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
