import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { getCycle, getCycleMemberRuns } from "@/lib/admin/matchingCycles";
import { listAllProfiles, toMemberSummary, loadSuspectedDuplicateUids } from "@/lib/admin/profiles";
import { resolvePersonId } from "@/lib/matching/identity";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ cycleId: string }> }) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const { cycleId } = await context.params;
  const [cycle, runs, rows, suspectedDuplicateUids] = await Promise.all([
    getCycle(cycleId),
    getCycleMemberRuns(cycleId),
    listAllProfiles(),
    loadSuspectedDuplicateUids(),
  ]);
  if (!cycle) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const byPersonId = new Map(rows.map((r) => [resolvePersonId(r.uid, r.profile), r]));

  const recipients = runs.map(({ id: personId, data }) => {
    const row = byPersonId.get(personId);
    const summary = row ? toMemberSummary(row.uid, row.profile, suspectedDuplicateUids) : null;
    return {
      personId,
      uid: row?.uid ?? null,
      firstName: summary?.firstName ?? "(perfil no disponible)",
      photoPath: summary?.photoPath ?? null,
      runStatus: data.status,
      proposalCount: data.status === "completed" ? data.proposalCount : null,
      error: data.error,
      diagnostics: data.diagnostics ?? null,
    };
  });

  recipients.sort((a, b) => (a.proposalCount ?? -1) - (b.proposalCount ?? -1));

  return NextResponse.json({ ok: true, cycle, recipients });
}
