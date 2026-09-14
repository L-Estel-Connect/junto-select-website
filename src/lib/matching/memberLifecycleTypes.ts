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
}

export interface MemberLifecycleSummary {
  proposalsWaitingForDecision: number;
  invitationsWaitingForDecision: number;
  mutualIntroductionsCount: number;
}

export type MemberDecisionError = "not_found" | "not_your_proposal" | "cannot_decide";

export type MemberDecisionResult =
  | { ok: true; alreadyRecorded: boolean }
  | { ok: false; error: MemberDecisionError };
