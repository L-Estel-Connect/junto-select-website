import type { DuplicateStatus } from "@/lib/introduction/types";
import type { ScoreDimensionBreakdown } from "./scoring";

/**
 * V1 monthly matching engine — schema for the collections that live
 * entirely server-side (written only via the Admin SDK from
 * src/lib/matching/*, never from client code). Firestore rules default-deny
 * all of these except `proposals`, which members can read (their own only).
 *
 * See README "Monthly matching engine" for the full architecture writeup.
 */

// --- Rollout staging -------------------------------------------------------

/**
 * dry_run: computes everything, writes cycle/memberRun bookkeeping, but
 * never writes to `proposals` or `pairHistory` — nothing member-facing is
 * created. allowlist: real writes, but only for personIds explicitly listed
 * in the cycle's config — the "live test with specific accounts" stage.
 * limited_live: real writes, no explicit allowlist, but capped to
 * `maxMembersPerRun` recipients — a broader but still bounded live stage.
 * production: real writes, the full active_search pool. Nothing in this
 * codebase schedules `production` automatically — see engine.ts and the
 * README for what activating the automatic monthly scheduler actually
 * requires (a manual Cloud Scheduler setup, deliberately not done yet).
 */
export type CycleMode = "dry_run" | "allowlist" | "limited_live" | "production";

export type CycleStatus = "pending" | "running" | "completed" | "failed";

export interface CycleConfig {
  /** Hard safety valve — never process more recipients than this in one run. */
  maxMembersPerRun: number;
  /** Hard safety valve — never score more candidates than this per member. */
  maxCandidatesPerMember: number;
  /** 0-100. A candidate must score at or above this to be proposed. */
  qualityThreshold: number;
  /** Which SCORING_WEIGHTS_* table to use — see scoring.ts. */
  scoringVersion: number;
  /** Required, and only meaningful, when mode === "allowlist". */
  allowlistPersonIds?: string[];
}

export interface MatchingCycleDocument {
  id: string;
  mode: CycleMode;
  status: CycleStatus;
  config: CycleConfig;
  createdAt: unknown;
  startedAt: unknown | null;
  completedAt: unknown | null;
  stats: {
    recipientsConsidered: number;
    recipientsCompleted: number;
    proposalsCreated: number;
    recipientsWithZeroProposals: number;
  };
  error: string | null;
}

// --- Per-member idempotency / crash-resume ---------------------------------

export type MemberRunStatus = "claimed" | "completed" | "failed";

export interface MemberRunDocument {
  personId: string;
  status: MemberRunStatus;
  claimedAt: unknown;
  completedAt: unknown | null;
  /**
   * The only place the hard "max 3" invariant is actually enforced against
   * concurrent/duplicate execution — every proposal write increments this
   * inside the same transaction that creates the proposal doc, and the
   * transaction refuses to write a proposal once this is already 3.
   */
  proposalCount: number;
  candidateCount: number;
  error: string | null;
}

// --- Proposal -> Invitation -> Introduction lifecycle -----------------
//
// "Proposal ≠ Introduction": a proposal is only Junto selecting a
// candidate FOR an active/paid member. It becomes a two-sided invitation
// only once that member says Interested — at which point the (possibly
// passive/free) candidate is invited, for free, to review the member's
// profile and answer for themselves. Only when BOTH sides have said
// Interested does a mutual introduction exist. Modeled as three separate,
// explicitly-staged documents (rather than one growing status field)
// because the two sides have different audiences, different Firestore
// read rules, and need to be counted separately for funnel analytics
// (see analytics.ts) — conflating them would make "3 selections, 0
// introductions" impossible to diagnose later.

/**
 * "No me interesa" (a considered no) vs "Ahora no" (not now, circumstantial)
 * — kept as an open string union from V1 so a future UI can add more
 * specific reasons without a schema migration. Applies identically on
 * either side of the lifecycle (a member's Pass on a proposal, or a
 * candidate's Pass on an invitation) — same cooldown treatment either way.
 */
export type PassType = "no_me_interesa" | "ahora_no";

/**
 * Stage 1: the algorithm's selection, shown to the active/paid member.
 * `proposed` -> (optional) `viewed` -> `member_interested` | `member_passed`.
 * `member_interested` transitions to `mutual_interested` once the
 * reciprocal invitation this creates is itself accepted. `expired` is
 * reserved for a future TTL/expiry job — nothing sets it yet.
 */
export type ProposalStage =
  | "proposed"
  | "viewed"
  | "member_interested"
  | "member_passed"
  | "mutual_interested"
  | "expired";

export interface ProposalDocument {
  cycleId: string;
  recipientPersonId: string; // the active/paid member this was selected FOR
  candidatePersonId: string; // who was selected — may be passive/free
  // Snapshot of the uids at generation time, for display/rules — a merge
  // happening later never rewrites historical proposals.
  recipientUid: string;
  candidateUid: string;
  score: number;
  scoringVersion: number;
  // Internal-only observability (§10 of the matching audit) — never shown
  // to a member. Lets a later calibration pass see not just the final
  // score but why: how much of the total possible weight was actually
  // evaluable for this pair (`scoreCoverage`), how far that was scaled
  // down for low coverage (`scoreConfidence`), and the exact per-dimension
  // fit/contribution (`scoreBreakdown`) — see scoring.ts's ScoreResult.
  scoreCoverage: number;
  scoreConfidence: number;
  scoreBreakdown: ScoreDimensionBreakdown[];
  stage: ProposalStage;
  passType: PassType | null;
  createdAt: unknown;
  viewedAt: unknown | null;
  decidedAt: unknown | null; // when member_interested/member_passed was recorded
  updatedAt: unknown;
}

/**
 * Stage 2: created only once a proposal reaches `member_interested` — the
 * free, no-payment-required invitation for the originally-selected
 * candidate to review the member's profile and respond. Same document id
 * as the proposal that spawned it (1:1, deterministic, idempotent to
 * create twice). `invited` -> (optional) `viewed` -> `candidate_interested`
 * | `candidate_passed` -> (if interested) `mutual_interested`.
 */
export type InvitationStage =
  | "invited"
  | "viewed"
  | "candidate_interested"
  | "candidate_passed"
  | "mutual_interested"
  | "expired";

export interface InvitationDocument {
  proposalId: string;
  cycleId: string;
  // The invited person — the original candidate, now asked for a free
  // yes/no on the member who was interested in them.
  recipientPersonId: string;
  recipientUid: string;
  // Who this invitation is on behalf of (the original active/paid member).
  inviterPersonId: string;
  inviterUid: string;
  stage: InvitationStage;
  passType: PassType | null;
  createdAt: unknown;
  viewedAt: unknown | null;
  decidedAt: unknown | null;
  updatedAt: unknown;
}

/**
 * Stage 3: exists if and only if both sides said Interested. Same document
 * id as the originating proposal/invitation. `contactRevealedAt` is a
 * field only — no contact-reveal flow reads or writes it yet; it's here so
 * that future feature is a new function against an existing field, not a
 * schema migration.
 */
export interface IntroductionDocument {
  proposalId: string;
  cycleId: string;
  personIdA: string; // the original active/paid member
  personIdB: string; // the original candidate
  uidA: string;
  uidB: string;
  createdAt: unknown;
  contactRevealedAt: unknown | null;
}

// --- Pair history (symmetric, canonical sorted-pair id) --------------------

/**
 * `pending`: proposed, member hasn't decided. `invited`: member said
 * Interested, candidate hasn't decided yet. `passed`: either side passed —
 * cooldown applies. `mutual`: introduction created — terminal, not
 * ordinarily re-proposed. `blocked`: permanent safety/do-not-match
 * exclusion, set only by a human, never by the matching engine itself.
 */
export type PairHistoryState = "pending" | "invited" | "passed" | "mutual" | "blocked";

export interface PairHistoryDocument {
  personIdLow: string;
  personIdHigh: string;
  state: PairHistoryState;
  passType: PassType | null;
  /** Only set when state === "passed" — pair is ineligible until this passes. */
  cooldownUntil: unknown | null;
  /** Only set when state === "blocked" — a permanent safety/do-not-match exclusion. */
  blockedReason: string | null;
  lastCycleId: string;
  proposalCount: number;
  createdAt: unknown;
  updatedAt: unknown;
}

// --- Duplicate-person infrastructure ----------------------------------

export interface PersonDocument {
  primaryUid: string;
  linkedUids: string[];
  createdAt: unknown;
  updatedAt: unknown;
}

export type DuplicateCandidateSignal =
  | "phone_exact"
  | "email_exact"
  | "instagram_exact"
  | "linkedin_exact"
  | "photo_hash_exact";

export type DuplicateCandidateStatus = "open" | "dismissed" | "escalated";

export interface DuplicateCandidateDocument {
  uidLow: string;
  uidHigh: string;
  score: number;
  signals: DuplicateCandidateSignal[];
  status: DuplicateCandidateStatus;
  firstDetectedAt: unknown;
  lastDetectedAt: unknown;
}

export type { DuplicateStatus };
