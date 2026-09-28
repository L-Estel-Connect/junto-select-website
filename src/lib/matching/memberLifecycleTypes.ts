import type { PublicProfileView, RevealedContact } from "@/lib/introduction/publicProfile";
import type { InvitationDocument, PassType, ProposalDocument } from "./types";

/**
 * Plain types only (no Firebase Admin imports) — deliberately separate
 * from memberLifecycle.ts, which is "server-only" and therefore unsafe to
 * type-import from a client component (matches the existing convention:
 * MemberSuggestPanel.tsx redefines its own view types rather than
 * type-importing from the "server-only" manualSuggestion.ts). Both the
 * server module and every client component that renders its API responses
 * import from here instead.
 */

export interface MemberProposalView {
  id: string;
  stage: ProposalDocument["stage"];
  passType: PassType | null;
  createdAt: unknown;
  candidate: PublicProfileView | null;
}

export interface MemberInvitationView {
  id: string;
  stage: InvitationDocument["stage"];
  passType: PassType | null;
  createdAt: unknown;
  inviter: PublicProfileView | null;
}

export interface MemberIntroductionView {
  id: string;
  createdAt: unknown;
  other: PublicProfileView | null;
  contacts: RevealedContact[];
  /** Present only for a Reconnect-originated introduction — see IntroductionDocument.eventLabel. */
  eventLabel: string | null;
}

/**
 * The lightweight shape for the /member/connections OVERVIEW list — only
 * what a compact card needs (see ConnectionCard.tsx), deliberately never
 * the education/height/languages/children/relationshipIntention/smoking/
 * drinking/activityLevel/presentationText fields PublicProfileView also
 * carries, and NEVER contacts. Built from the exact same
 * buildPublicProfileView() as the full detail view (see memberLifecycle.ts
 * toSummaryView), so firstName/age/city can never drift between the
 * summary and detail — this is a narrower RESPONSE shape, not a
 * differently-computed one.
 */
export interface MemberConnectionSummaryView {
  id: string;
  createdAt: unknown;
  other: {
    uid: string;
    firstName: string;
    age: number | null;
    city: string;
    primaryPhoto: string | null;
  } | null;
  /** Present only for a Reconnect-originated introduction — see IntroductionDocument.eventLabel. */
  eventLabel: string | null;
}

/**
 * The lightweight shape for the /member/connections OVERVIEW list — only
 * what a compact card needs (see ConnectionCard.tsx), deliberately never
 * the education/height/languages/children/relationshipIntention/smoking/
 * drinking/activityLevel/presentationText fields PublicProfileView also
 * carries, and NEVER contacts. Built from the exact same
 * buildPublicProfileView() as the full detail view (see memberLifecycle.ts
 * toSummaryView), so firstName/age/city can never drift between the
 * summary and detail — this is a narrower RESPONSE shape, not a
 * differently-computed one.
 */
export interface MemberConnectionSummaryView {
  id: string;
  createdAt: unknown;
  other: {
    uid: string;
    firstName: string;
    age: number | null;
    city: string;
    primaryPhoto: string | null;
  } | null;
}

export interface MemberLifecycleSummary {
  proposalsWaitingForDecision: number;
  invitationsWaitingForDecision: number;
  mutualIntroductionsCount: number;
}

/**
 * `no_longer_compatible`: this "interested" decision was refused because
 * a fresh reciprocal hard-filter check (see pairHistory.ts
 * stillReciprocallyCompatible) found the pair no longer passes — never
 * carries which field changed or whose dealbreaker it was; see
 * memberDecisionErrorLabel for the single neutral, privacy-safe message
 * shown for it.
 */
export type MemberDecisionError = "not_found" | "not_your_proposal" | "cannot_decide" | "no_longer_compatible";

export type MemberDecisionResult =
  | { ok: true; alreadyRecorded: boolean }
  | { ok: false; error: MemberDecisionError };
