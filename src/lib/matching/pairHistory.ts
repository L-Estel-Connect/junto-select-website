import "server-only";
import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { addMonths, PASS_COOLDOWN_MONTHS, pairKey } from "./config";
import { passesHardFilters } from "./hardFilters";
import { queueOutboundEmail } from "@/lib/notifications/outboundEmails";
import { withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";
import type {
  InvitationDocument,
  PairHistoryDocument,
  PairHistoryExclusionReason,
  PairHistoryState,
  PassType,
  ProposalDocument,
} from "./types";

async function loadProfileInTransaction(tx: Transaction, uid: string): Promise<ProfileDocument | null> {
  const snap = await tx.get(adminDb.doc(`profiles/${uid}`));
  if (!snap.exists) return null;
  return withProfileDefaults(uid, snap.data() as Partial<ProfileDocument>);
}

/**
 * Decision-time hard-filter revalidation (see README/audit "Stale
 * proposal revalidation"): before an "interested" decision progresses a
 * proposal/invitation toward an introduction, this re-loads BOTH
 * profiles FRESH from Firestore (never the score/profile snapshot
 * captured when the proposal was created) and normalizes legacy values
 * exactly as every other read path does (`withProfileDefaults`), then
 * runs the CURRENT reciprocal hard filters — the same deterministic
 * check used at proposal-creation time, nothing new. Only hard filters
 * matter here, on purpose: a soft preference drifting (e.g. a
 * `prefiero_que_no` scoring signal, or the score itself) is never a
 * reason to block two people who are both actively saying yes right now
 * — only a genuine hard dealbreaker mismatch is. A missing profile
 * (account deleted since the proposal was made) fails closed, the same
 * "unknown is never compatible" rule hardFilters.ts already applies to
 * every other unknown case. Reads happen inside the SAME transaction as
 * the decision being recorded, before any write, so there is no race
 * between this check and the write it gates.
 */
async function stillReciprocallyCompatible(tx: Transaction, uidA: string, uidB: string): Promise<boolean> {
  const [a, b] = await Promise.all([loadProfileInTransaction(tx, uidA), loadProfileInTransaction(tx, uidB)]);
  if (!a || !b) return false;
  return passesHardFilters(a, b);
}

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
): Promise<{ alreadyRecorded: boolean; blockedIncompatible?: boolean }> {
  const proposalRef = adminDb.doc(`proposals/${proposalId}`);
  const invitationRef = adminDb.doc(`invitations/${proposalId}`);

  const result = await adminDb.runTransaction(async (tx) => {
    const proposalSnap = await tx.get(proposalRef);
    if (!proposalSnap.exists) throw new Error(`proposal ${proposalId} not found`);
    const proposal = proposalSnap.data() as ProposalDocument;

    const targetStage = decision === "interested" ? "member_interested" : "member_passed";
    // "mutual_interested" is stage progression BEYOND member_interested,
    // reached once the candidate also says Interested (see
    // recordCandidateDecision below) — it is never inconsistent with this
    // member having said "interested", so a repeated/duplicate "interested"
    // call here must stay idempotent even after the match already went
    // mutual, exactly like recordCandidateDecision's own equivalent check.
    // A proposal already marked `no_longer_compatible` (see
    // stillReciprocallyCompatible below) is likewise a terminal outcome of
    // a PRIOR "interested" decision — repeating that decision must return
    // the same outcome, not throw as if it were a fresh conflicting one.
    if (
      proposal.stage === targetStage ||
      (decision === "interested" && proposal.stage === "mutual_interested") ||
      (decision === "interested" && proposal.stage === "no_longer_compatible")
    ) {
      return {
        alreadyRecorded: true,
        invitationCreatedForUid: null as string | null,
        blockedIncompatible: proposal.stage === "no_longer_compatible",
      };
    }
    if (proposal.stage !== "proposed" && proposal.stage !== "viewed") {
      throw new Error(`proposal ${proposalId} already decided (${proposal.stage})`);
    }

    // Firestore transactions require every read before any write — read
    // the invitation doc now (even though only the "interested" branch
    // below needs it) so the write(s) that follow are never interleaved
    // with a read.
    const invitationSnap = decision === "interested" ? await tx.get(invitationRef) : null;

    // Decision-time hard-filter revalidation: an "interested" decision is
    // the one that progresses this pair toward an introduction, so it's
    // the one point where a stale proposal (created when both sides
    // passed the reciprocal hard filters, but one side has since edited a
    // self attribute) must not be allowed through — see
    // stillReciprocallyCompatible's own doc comment. A "passed" decision
    // never progresses anything, so it is deliberately never revalidated.
    if (decision === "interested") {
      const compatible = await stillReciprocallyCompatible(tx, proposal.recipientUid, proposal.candidateUid);
      if (!compatible) {
        const now = FieldValue.serverTimestamp();
        tx.update(proposalRef, {
          stage: "no_longer_compatible",
          decidedAt: now,
          updatedAt: now,
        });
        return { alreadyRecorded: false, invitationCreatedForUid: null, blockedIncompatible: true };
      }
    }

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
      return { alreadyRecorded: false, invitationCreatedForUid: null };
    }

    // "interested" -> create (or no-op if it already exists) the free,
    // no-payment-required invitation for the original candidate.
    const invitationCreated = !invitationSnap?.exists;
    if (invitationCreated) {
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

    return { alreadyRecorded: false, invitationCreatedForUid: invitationCreated ? proposal.candidateUid : null };
  });

  if (result.invitationCreatedForUid) {
    // Best-effort notification only — never allowed to affect this
    // decision's own success/failure.
    const candidateUid = result.invitationCreatedForUid;
    queueOutboundEmail({ type: "invitation_received", uid: candidateUid, email: null, data: {} }).catch((error) => {
      console.error(`recordMemberDecision: failed to queue invitation_received email for uid ${candidateUid}`, error);
    });
  }

  return { alreadyRecorded: result.alreadyRecorded, blockedIncompatible: result.blockedIncompatible };
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
): Promise<{ alreadyRecorded: boolean; blockedIncompatible?: boolean }> {
  const invitationRef = adminDb.doc(`invitations/${invitationId}`);
  const proposalRef = adminDb.doc(`proposals/${invitationId}`); // same id as the source proposal
  const introductionRef = adminDb.doc(`introductions/${invitationId}`);

  const result = await adminDb.runTransaction(async (tx) => {
    const invitationSnap = await tx.get(invitationRef);
    if (!invitationSnap.exists) throw new Error(`invitation ${invitationId} not found`);
    const invitation = invitationSnap.data() as InvitationDocument;

    const targetStage = decision === "interested" ? "candidate_interested" : "candidate_passed";
    // Same idempotency treatment as recordMemberDecision above for a
    // previously-blocked "interested" decision — see its comment.
    if (
      invitation.stage === targetStage ||
      invitation.stage === "mutual_interested" ||
      (decision === "interested" && invitation.stage === "no_longer_compatible")
    ) {
      return {
        alreadyRecorded: true,
        introductionCreatedForUids: null as [string, string] | null,
        blockedIncompatible: invitation.stage === "no_longer_compatible",
      };
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
      return { alreadyRecorded: false, introductionCreatedForUids: null };
    }

    // "interested" -> mutual. Flip both proposal and invitation to
    // mutual_interested and create the introduction record. All reads
    // (proposal, introduction) happen before any write below — Firestore
    // transactions require every read before any write.
    const proposalSnap = await tx.get(proposalRef);
    if (!proposalSnap.exists) throw new Error(`proposal ${invitationId} not found for invitation`);
    const proposal = proposalSnap.data() as ProposalDocument;
    const introductionSnap = await tx.get(introductionRef);

    // Decision-time hard-filter revalidation — same rule and same reason
    // as recordMemberDecision above, applied at the point BOTH sides have
    // now said Interested and a mutual introduction is about to be
    // created. Only the invitation (this stage's own document) is marked
    // `no_longer_compatible`; the proposal is left exactly as
    // `member_interested`, which remains a true statement about what the
    // original member did — the incompatibility was only discovered here,
    // at the candidate's decision.
    const compatible = await stillReciprocallyCompatible(tx, invitation.inviterUid, invitation.recipientUid);
    if (!compatible) {
      tx.update(invitationRef, {
        stage: "no_longer_compatible",
        decidedAt: now,
        updatedAt: now,
      });
      return { alreadyRecorded: false, introductionCreatedForUids: null, blockedIncompatible: true };
    }

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

    const introductionCreated = !introductionSnap.exists;
    if (introductionCreated) {
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

    return {
      alreadyRecorded: false,
      introductionCreatedForUids: introductionCreated
        ? ([proposal.recipientUid, proposal.candidateUid] as [string, string])
        : null,
    };
  });

  if (result.introductionCreatedForUids) {
    // Best-effort notification only — never allowed to affect this
    // decision's own success/failure. Both original parties are told.
    for (const uid of result.introductionCreatedForUids) {
      queueOutboundEmail({ type: "mutual_introduction", uid, email: null, data: {} }).catch((error) => {
        console.error(`recordCandidateDecision: failed to queue mutual_introduction email for uid ${uid}`, error);
      });
    }
  }

  return { alreadyRecorded: result.alreadyRecorded, blockedIncompatible: result.blockedIncompatible };
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
 * Reverses an accidental `blockPair()` — e.g. the wrong two names picked
 * in the admin PersonPicker. `blockPair()` destructively overwrites
 * whatever `state`/`passType`/`cooldownUntil` the pair had before being
 * blocked (there is no separate "reason for exclusion" history kept
 * alongside it), so there is no prior state to restore — the only safe,
 * well-defined recovery is to delete this pair's `pairHistory` document
 * entirely, making the pair immediately eligible again exactly as if
 * they had never interacted (`classifyPairHistoryState(null)` — see
 * above). This never touches any OTHER pair's history, and never touches
 * `proposals`/`invitations`/`introductions` at all — those are separate
 * documents this function never reads or writes. Refuses to act unless
 * the pair is CURRENTLY `blocked`, so this can never be accidentally
 * pointed at a pair mid-flow (`pending`/`invited`) or already `mutual`
 * and silently erase that instead.
 */
export async function unblockPair(personIdA: string, personIdB: string): Promise<{ ok: boolean; error?: string }> {
  const ref = pairHistoryRef(personIdA, personIdB);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "pair_not_found" };
  const history = snap.data() as PairHistoryDocument;
  if (history.state !== "blocked") return { ok: false, error: "pair_not_blocked" };
  await ref.delete();
  return { ok: true };
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
