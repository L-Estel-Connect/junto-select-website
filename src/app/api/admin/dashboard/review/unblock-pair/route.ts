import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { unblockPair } from "@/lib/matching/pairHistory";

export const runtime = "nodejs";

/**
 * Dashboard-facing wrapper around `unblockPair()` — same auth pattern as
 * block-pair/route.ts (admin Firebase session, not the automation
 * secret). Takes `personIdLow`/`personIdHigh` directly (not uids): the
 * Review page already has both from the blocked-pairs list it rendered
 * (`GET /api/admin/dashboard/review`), so there's no need to re-resolve
 * them from profiles the way block-pair does when starting from a
 * PersonPicker selection.
 */
export async function POST(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  let body: { personIdLow?: string; personIdHigh?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { personIdLow, personIdHigh } = body;
  if (!personIdLow || !personIdHigh) {
    return NextResponse.json({ ok: false, error: "personIdLow_and_personIdHigh_required" }, { status: 400 });
  }

  try {
    const result = await unblockPair(personIdLow, personIdHigh);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "unblock_failed" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin unblock-pair failed:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
