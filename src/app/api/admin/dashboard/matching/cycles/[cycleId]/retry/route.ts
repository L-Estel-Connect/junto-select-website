import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { getCycle } from "@/lib/admin/matchingCycles";
import { runMatchingCycle } from "@/lib/matching/engine";

export const runtime = "nodejs";

/**
 * "Retry failed/stale matching run" (Admin Dashboard spec §8/§14) — this is
 * NOT a new capability: runMatchingCycle is already idempotent and already
 * reclaims stale/failed memberRuns on every invocation (see engine.ts's
 * claimMemberRun). This route only re-invokes it for an EXISTING cycle,
 * using that cycle's own stored mode/config — it can never start a new
 * cycle or change what mode/config it runs under, which is deliberately
 * kept out of the dashboard (see README / final report "intentionally
 * deferred").
 */
export async function POST(request: Request, context: { params: Promise<{ cycleId: string }> }) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const { cycleId } = await context.params;
  const cycle = await getCycle(cycleId);
  if (!cycle) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  try {
    const result = await runMatchingCycle(cycleId, cycle.mode, cycle.config);
    return NextResponse.json({ ok: true, cycle: result });
  } catch (error) {
    console.error("Admin retry of matching cycle failed:", error);
    return NextResponse.json({ ok: false, error: "retry_failed" }, { status: 500 });
  }
}
