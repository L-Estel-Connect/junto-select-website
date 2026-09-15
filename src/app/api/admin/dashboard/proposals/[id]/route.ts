import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { getProposalDetail, isoOrNull } from "@/lib/admin/proposalsList";
import { getAdminProfileViewByUid } from "@/lib/admin/memberDetail";
import { getPairHistoryDocument } from "@/lib/matching/pairHistory";
import { computeMatchWhy } from "@/lib/admin/why";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await context.params;
  const detail = await getProposalDetail(id);
  if (!detail) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { proposal, invitation, introduction } = detail;
  const [recipient, candidate, pairHistory] = await Promise.all([
    getAdminProfileViewByUid(proposal.recipientUid),
    getAdminProfileViewByUid(proposal.candidateUid),
    getPairHistoryDocument(proposal.recipientPersonId, proposal.candidatePersonId),
  ]);

  const why = computeMatchWhy({
    score: proposal.score,
    scoringVersion: proposal.scoringVersion,
    coverage: proposal.scoreCoverage,
    confidence: proposal.scoreConfidence,
    breakdown: proposal.scoreBreakdown,
  });

  // `proposal`/`invitation`/`introduction`/`pairHistory` are raw Firestore
  // documents — their timestamp fields are real Admin SDK `Timestamp`
  // instances at this point. `NextResponse.json` (= JSON.stringify) has no
  // special handling for that class: it reduces one to a plain
  // `{_seconds, _nanoseconds}` object, which is neither a valid `Date`
  // constructor argument nor something with `.toDate()` — the client's
  // `fmt()` was rendering that as "Invalid Date". Converting to ISO
  // strings here (same `isoOrNull` helper `listAllProposalSummaries`
  // already uses) fixes the actual root cause instead of papering over it
  // client-side; nothing about the underlying Firestore documents changes.
  return NextResponse.json({
    ok: true,
    id,
    proposal: {
      ...proposal,
      createdAt: isoOrNull(proposal.createdAt),
      viewedAt: isoOrNull(proposal.viewedAt),
      decidedAt: isoOrNull(proposal.decidedAt),
      updatedAt: isoOrNull(proposal.updatedAt),
    },
    invitation: invitation && {
      ...invitation,
      createdAt: isoOrNull(invitation.createdAt),
      viewedAt: isoOrNull(invitation.viewedAt),
      decidedAt: isoOrNull(invitation.decidedAt),
      updatedAt: isoOrNull(invitation.updatedAt),
    },
    introduction: introduction && {
      ...introduction,
      createdAt: isoOrNull(introduction.createdAt),
      contactRevealedAt: isoOrNull(introduction.contactRevealedAt),
    },
    recipient,
    candidate,
    pairHistory: pairHistory && {
      ...pairHistory,
      cooldownUntil: isoOrNull(pairHistory.cooldownUntil),
      createdAt: isoOrNull(pairHistory.createdAt),
      updatedAt: isoOrNull(pairHistory.updatedAt),
    },
    why,
  });
}
