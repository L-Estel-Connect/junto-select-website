import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getAge } from "@/lib/introduction/age";
import type { ProfileDocument } from "@/lib/introduction/types";
import { resolvePersonId } from "./identity";
import { loadEligiblePool } from "./engine";
import { isProfileInEligiblePool } from "./eligibility";
import {
  evaluateHardFiltersDetailed,
  type HardFilterFailure,
} from "./hardFilters";
import {
  classifyPairHistoryState,
  getPairEligibility,
  loadPairHistoryMapFor,
  markPairPendingInTransaction,
} from "./pairHistory";
import { scorePair, SCORING_VERSION, type ScoreResult } from "./scoring";
import { MANUAL_SUGGESTION_CYCLE_ID, manualProposalId } from "./config";
import type { PairHistoryExclusionReason } from "./types";

/**
 * "Founder / manual suggestion" — the exceptional path described in the
 * Admin Dashboard spec: the admin picks one specific candidate for one
 * specific member, outside the normal 0-3-per-cycle algorithmic flow. This
 * module NEVER overrides a blocked pair, a confirmed/suspected duplicate,
 * the Madrid eligibility gate, or a user-declared reciprocal hard
 * requirement — those are re-validated here from scratch (never trusted
 * from whatever the search UI showed), and creation refuses outright if any
 * of them fail. The only thing "manual" about this path is WHO gets picked,
 * never what's allowed to match.
 *
 * A resulting proposal enters the exact same Proposal -> Invitation ->
 * Introduction lifecycle as an algorithmic one (recordMemberDecision /
 * recordCandidateDecision are agnostic to `source`) and consumes neither
 * side's consent — the recipient still has to say Interested, and so does
 * the candidate, before anything becomes mutual.
 *
 * Deliberately does NOT consume the member's normal monthly quota: it never
 * touches `matchingCycles/*\/memberRuns` at all (the only place the max-3
 * cap is enforced) — see MANUAL_SUGGESTION_CYCLE_ID.
 */

function ageOf(profile: ProfileDocument): number | null {
  const bd = profile.private.birthDate;
  if (!bd) return null;
  return getAge(bd.toDate().toISOString().slice(0, 10));
}

export interface ManualCandidateResult {
  uid: string;
  personId: string;
  firstName: string;
  age: number | null;
  gender: ProfileDocument["visible"]["gender"];
  city: string;
  photoPath: string | null;
  searchStatus: ProfileDocument["meta"]["searchStatus"];
  hardFilterFailures: HardFilterFailure[];
  pairHistoryReason: PairHistoryExclusionReason | null;
  alreadySuggested: boolean;
  score: ScoreResult | null;
  canSuggest: boolean;
}

/**
 * Every OTHER personId this personId has already had a manual suggestion
 * with (in either direction) — two equality-filtered queries, not one read
 * per candidate.
 */
async function loadManuallySuggestedPersonIds(personId: string): Promise<Set<string>> {
  const [asRecipient, asCandidate] = await Promise.all([
    adminDb
      .collection("proposals")
      .where("recipientPersonId", "==", personId)
      .where("source", "==", "admin_manual")
      .get(),
    adminDb
      .collection("proposals")
      .where("candidatePersonId", "==", personId)
      .where("source", "==", "admin_manual")
      .get(),
  ]);
  const set = new Set<string>();
  for (const doc of asRecipient.docs) set.add(doc.data().candidatePersonId as string);
  for (const doc of asCandidate.docs) set.add(doc.data().recipientPersonId as string);
  return set;
}

/**
 * Search the eligible pool for candidates to manually suggest to
 * `recipientUid`, with each candidate's hard-filter/pair-history/score
 * status precomputed so the admin sees "Not compatible" (and exactly why)
 * before ever attempting to send one. Bounded to a small result set — this
 * is a search box, not a full member browser.
 */
export async function searchManualCandidates(
  recipientUid: string,
  query: string,
): Promise<
  | { ok: false; error: "recipient_not_found" }
  | { ok: true; recipientPersonId: string; candidates: ManualCandidateResult[] }
> {
  const recipientSnap = await adminDb.doc(`profiles/${recipientUid}`).get();
  if (!recipientSnap.exists) return { ok: false, error: "recipient_not_found" };
  const recipientProfile = recipientSnap.data() as ProfileDocument;
  const recipientPersonId = resolvePersonId(recipientUid, recipientProfile);

  const pool = await loadEligiblePool();
  const trimmedQuery = query.trim().toLowerCase();

  let candidates = pool.filter((p) => p.personId !== recipientPersonId);
  if (trimmedQuery) {
    candidates = candidates.filter((p) =>
      p.profile.visible.firstName.toLowerCase().includes(trimmedQuery),
    );
  }
  // A search box, not a full member list — keep the payload small.
  candidates = candidates.slice(0, 40);

  const [pairHistoryMap, alreadySuggestedSet] = await Promise.all([
    loadPairHistoryMapFor(recipientPersonId),
    loadManuallySuggestedPersonIds(recipientPersonId),
  ]);

  const results: ManualCandidateResult[] = candidates.map(({ uid, personId, profile }) => {
    const hardFilterFailures = evaluateHardFiltersDetailed(recipientProfile, profile);
    const { reason: pairHistoryReason } = classifyPairHistoryState(pairHistoryMap.get(personId) ?? null);
    const alreadySuggested = alreadySuggestedSet.has(personId);
    const score =
      hardFilterFailures.length === 0 ? scorePair(recipientProfile, profile) : null;

    return {
      uid,
      personId,
      firstName: profile.visible.firstName,
      age: ageOf(profile),
      gender: profile.visible.gender,
      city: profile.visible.city,
      photoPath: profile.photos[0] ?? null,
      searchStatus: profile.meta.searchStatus,
      hardFilterFailures,
      pairHistoryReason,
      alreadySuggested,
      score,
      canSuggest: hardFilterFailures.length === 0 && pairHistoryReason === null && !alreadySuggested,
    };
  });

  return { ok: true, recipientPersonId, candidates: results };
}

export interface CreateManualSuggestionParams {
  recipientUid: string;
  candidateUid: string;
  adminUid: string;
  adminEmail: string;
  note: string | null;
}

export type CreateManualSuggestionResult =
  | { ok: true; proposalId: string; score: ScoreResult }
  | {
      ok: false;
      error:
        | "recipient_not_found"
        | "candidate_not_found"
        | "same_person"
        | "recipient_not_eligible"
        | "candidate_not_eligible"
        | "hard_filter_failed"
        | "pair_not_eligible"
        | "already_suggested";
      hardFilterFailures?: HardFilterFailure[];
      pairHistoryReason?: PairHistoryExclusionReason;
    };

/**
 * Creates the manual-suggestion proposal, re-validating every safety
 * constraint server-side (never trusting whatever `searchManualCandidates`
 * showed the client, since that response could be stale by the time the
 * admin clicks "Suggest"). Idempotent via the deterministic
 * `manualProposalId`: a second attempt at the same unordered pair — now or
 * ever — resolves to the same document id and is refused as
 * `already_suggested`, which is also what makes this permanently
 * non-repeatable rather than merely rate-limited.
 */
export async function createManualSuggestion(
  params: CreateManualSuggestionParams,
): Promise<CreateManualSuggestionResult> {
  const [recipientSnap, candidateSnap] = await Promise.all([
    adminDb.doc(`profiles/${params.recipientUid}`).get(),
    adminDb.doc(`profiles/${params.candidateUid}`).get(),
  ]);
  if (!recipientSnap.exists) return { ok: false, error: "recipient_not_found" };
  if (!candidateSnap.exists) return { ok: false, error: "candidate_not_found" };

  const recipientProfile = recipientSnap.data() as ProfileDocument;
  const candidateProfile = candidateSnap.data() as ProfileDocument;
  const recipientPersonId = resolvePersonId(params.recipientUid, recipientProfile);
  const candidatePersonId = resolvePersonId(params.candidateUid, candidateProfile);

  // Identity safety: the same real person (directly, or via a confirmed
  // merge) can never be suggested to themselves.
  if (recipientPersonId === candidatePersonId) return { ok: false, error: "same_person" };

  // Checked before pairHistory eligibility below: a pair that was already
  // manually suggested is always "pending" in pairHistory (this function
  // set it there), so checking pairHistory first would surface a generic
  // "pending_or_invited" instead of the more specific, more useful
  // "already_suggested" — and would do so even long after the original
  // suggestion resolved one way or another, which is exactly the
  // permanent, non-repeatable guarantee this id scheme is meant to give.
  const id = manualProposalId(recipientPersonId, candidatePersonId);
  const proposalRef = adminDb.doc(`proposals/${id}`);
  const existingSnap = await proposalRef.get();
  if (existingSnap.exists) return { ok: false, error: "already_suggested" };

  // Absolute system-level exclusions: Madrid eligibility and
  // suspected/confirmed duplicate status are never overridable, for
  // either side.
  if (!isProfileInEligiblePool(recipientProfile)) return { ok: false, error: "recipient_not_eligible" };
  if (!isProfileInEligiblePool(candidateProfile)) return { ok: false, error: "candidate_not_eligible" };

  // User-declared hard requirements: never silently overridden. Any
  // failure in either direction refuses the suggestion outright.
  const hardFilterFailures = evaluateHardFiltersDetailed(recipientProfile, candidateProfile);
  if (hardFilterFailures.length > 0) {
    return { ok: false, error: "hard_filter_failed", hardFilterFailures };
  }

  // Blocked pairs, an active cooldown, an already-pending/invited pair, or
  // an existing mutual introduction — respected exactly as the algorithm
  // respects them; no override architecture exists for any of these, so
  // none is invented here.
  const { eligible, reason } = await getPairEligibility(recipientPersonId, candidatePersonId);
  if (!eligible) return { ok: false, error: "pair_not_eligible", pairHistoryReason: reason ?? undefined };

  const result = scorePair(recipientProfile, candidateProfile);

  const created = await adminDb.runTransaction(async (tx) => {
    const existing = await tx.get(proposalRef);
    if (existing.exists) return false;

    const now = FieldValue.serverTimestamp();
    tx.set(proposalRef, {
      cycleId: MANUAL_SUGGESTION_CYCLE_ID,
      recipientPersonId,
      candidatePersonId,
      recipientUid: params.recipientUid,
      candidateUid: params.candidateUid,
      score: result.score,
      scoringVersion: SCORING_VERSION,
      scoreCoverage: result.coverage,
      scoreConfidence: result.confidence,
      scoreBreakdown: result.breakdown,
      source: "admin_manual",
      adminSuggestion: {
        adminUid: params.adminUid,
        adminEmail: params.adminEmail,
        note: params.note?.trim() || null,
        createdAt: now,
      },
      stage: "proposed",
      passType: null,
      createdAt: now,
      viewedAt: null,
      decidedAt: null,
      updatedAt: now,
    });
    // Deliberately does NOT touch any matchingCycles/*/memberRuns doc — see
    // module doc comment for why that's what keeps this outside the
    // algorithmic 0-3 quota rather than merely exempted from it.
    markPairPendingInTransaction(tx, recipientPersonId, candidatePersonId, MANUAL_SUGGESTION_CYCLE_ID);
    return true;
  });

  if (!created) return { ok: false, error: "already_suggested" };
  return { ok: true, proposalId: id, score: result };
}
