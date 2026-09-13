import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { computeSelectionCounts, getCycleMemberRuns, listCycles } from "@/lib/admin/matchingCycles";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const cycles = await listCycles();
  const items = await Promise.all(
    cycles.map(async (cycle) => {
      const runs = await getCycleMemberRuns(cycle.id);
      const counts = computeSelectionCounts(runs);
      return {
        id: cycle.id,
        mode: cycle.mode,
        status: cycle.status,
        recipients: cycle.stats.recipientsConsidered,
        processed: cycle.stats.recipientsCompleted,
        counts,
        totalSelections: cycle.stats.proposalsCreated,
        errors: runs.filter((r) => r.data.status === "failed").length,
      };
    }),
  );

  return NextResponse.json({ ok: true, items });
}
