import { NextResponse } from "next/server";
import { isAuthorizedAdminRequest } from "@/lib/matching/adminAuth";
import { runMatchingCycle } from "@/lib/matching/engine";
import type { CycleConfig, CycleMode } from "@/lib/matching/types";

export const runtime = "nodejs";

const VALID_MODES: CycleMode[] = ["dry_run", "allowlist", "limited_live", "production"];

/**
 * Manually triggers (or resumes) one matching cycle. There is no automatic
 * scheduler wired to this route — see README "Monthly matching engine" for
 * exactly what activating one later requires. Safe to call repeatedly with
 * the same cycleId: a completed cycle is a no-op, a partial one resumes.
 */
export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { cycleId?: string; mode?: string; config?: Partial<CycleConfig> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { cycleId, mode, config } = body;
  if (!cycleId || typeof cycleId !== "string") {
    return NextResponse.json({ ok: false, error: "cycleId_required" }, { status: 400 });
  }
  if (!mode || !VALID_MODES.includes(mode as CycleMode)) {
    return NextResponse.json({ ok: false, error: "invalid_mode" }, { status: 400 });
  }
  if (mode === "allowlist" && !config?.allowlistPersonIds?.length) {
    return NextResponse.json(
      { ok: false, error: "allowlist_mode_requires_allowlistPersonIds" },
      { status: 400 },
    );
  }

  try {
    const cycle = await runMatchingCycle(cycleId, mode as CycleMode, config ?? {});
    return NextResponse.json({ ok: true, cycle });
  } catch (error) {
    console.error("Matching cycle run failed:", error);
    return NextResponse.json({ ok: false, error: "cycle_run_failed" }, { status: 500 });
  }
}
