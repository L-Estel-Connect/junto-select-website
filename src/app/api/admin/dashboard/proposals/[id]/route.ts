import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { getProposalDetail } from "@/lib/admin/proposalsList";
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

  return NextResponse.json({
    ok: true,
    id,
    proposal,
    invitation,
    introduction,
    recipient,
    candidate,
    pairHistory,
    why,
  });
}
