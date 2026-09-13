import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { listRecentMatchingScans } from "@/lib/admin/matchingScans";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const scans = await listRecentMatchingScans();
  const items = scans.map(({ id, data }) => ({
    id,
    ranAt: (data.ranAt as { toDate?: () => Date } | null)?.toDate?.()?.toISOString() ?? null,
    membersDue: data.membersDue,
    membersAdvanced: data.membersAdvanced,
    membersRetryPending: data.membersRetryPending,
    proposalsCreated: data.proposalsCreated,
    membersWithZeroProposals: data.membersWithZeroProposals,
    errors: data.errors,
  }));

  return NextResponse.json({ ok: true, items });
}
