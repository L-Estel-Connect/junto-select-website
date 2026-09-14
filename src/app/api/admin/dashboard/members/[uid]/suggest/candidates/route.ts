import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { searchManualCandidates } from "@/lib/matching/manualSuggestion";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ uid: string }> }) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const { uid } = await context.params;
  const q = new URL(request.url).searchParams.get("q") ?? "";

  const result = await searchManualCandidates(uid, q);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        eligibility: result.error === "recipient_not_eligible" ? result.eligibility : undefined,
      },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, candidates: result.candidates });
}
