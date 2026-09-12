import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { InvitationDocument, ProposalDocument } from "./types";

/**
 * Funnel counts kept separate by design — "3 selections" is never the same
 * claim as "3 introductions delivered". This is what a future Admin
 * Dashboard needs to diagnose a paying member's zero-introductions case:
 *   0 selections -> candidate pool / criteria / matching issue
 *   selections > 0, memberInterested = 0 -> selections didn't appeal
 *   memberInterested > 0, candidateInterested = 0 -> candidates declined
 *   mutualIntroductions > 0 -> success
 * No dashboard UI is built here — this module only computes the numbers.
 */
export interface FunnelStats {
  selections: number;
  viewed: number;
  memberInterested: number;
  memberPassed: number;
  invitationsSent: number;
  candidateViewed: number;
  candidateInterested: number;
  candidatePassed: number;
  mutualIntroductions: number;
}

function summarize(proposals: ProposalDocument[], invitations: InvitationDocument[]): FunnelStats {
  return {
    selections: proposals.length,
    viewed: proposals.filter((p) => p.viewedAt !== null).length,
    memberInterested: proposals.filter(
      (p) => p.stage === "member_interested" || p.stage === "mutual_interested",
    ).length,
    memberPassed: proposals.filter((p) => p.stage === "member_passed").length,
    invitationsSent: invitations.length,
    candidateViewed: invitations.filter((i) => i.viewedAt !== null).length,
    candidateInterested: invitations.filter(
      (i) => i.stage === "candidate_interested" || i.stage === "mutual_interested",
    ).length,
    candidatePassed: invitations.filter((i) => i.stage === "candidate_passed").length,
    mutualIntroductions: proposals.filter((p) => p.stage === "mutual_interested").length,
  };
}

export async function computeCycleFunnelStats(cycleId: string): Promise<FunnelStats> {
  const [proposalsSnap, invitationsSnap] = await Promise.all([
    adminDb.collection("proposals").where("cycleId", "==", cycleId).get(),
    adminDb.collection("invitations").where("cycleId", "==", cycleId).get(),
  ]);
  return summarize(
    proposalsSnap.docs.map((d) => d.data() as ProposalDocument),
    invitationsSnap.docs.map((d) => d.data() as InvitationDocument),
  );
}

/** Same breakdown, scoped to one member (as the recipient side) across all cycles, or one cycle if given. */
export async function computeMemberFunnelStats(
  personId: string,
  cycleId?: string,
): Promise<FunnelStats> {
  let proposalsQuery = adminDb.collection("proposals").where("recipientPersonId", "==", personId);
  if (cycleId) proposalsQuery = proposalsQuery.where("cycleId", "==", cycleId);
  const proposalsSnap = await proposalsQuery.get();
  const proposals = proposalsSnap.docs.map((d) => d.data() as ProposalDocument);

  const proposalIds = proposalsSnap.docs.map((d) => d.id);
  const invitations: InvitationDocument[] = [];
  // Invitations spawned BY this member's own interest carry the same doc
  // id as their source proposal — fetch by id rather than a second query.
  for (const id of proposalIds) {
    const snap = await adminDb.doc(`invitations/${id}`).get();
    if (snap.exists) invitations.push(snap.data() as InvitationDocument);
  }

  return summarize(proposals, invitations);
}
