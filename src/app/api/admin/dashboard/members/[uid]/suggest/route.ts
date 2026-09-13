import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { createManualSuggestion } from "@/lib/matching/manualSuggestion";

export const runtime = "nodejs";

/**
 * Creates the "founder suggestion" — see manualSuggestion.ts for every
 * safety re-check this performs server-side regardless of what the search
 * screen showed. `admin.uid`/`admin.email` come from the verified session,
 * never from the request body, so the persisted `adminSuggestion` record
 * can't be spoofed.
 */
export async function POST(request: Request, context: { params: Promise<{ uid: string }> }) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const { uid: recipientUid } = await context.params;

  let body: { candidateUid?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.candidateUid) {
    return NextResponse.json({ ok: false, error: "candidateUid_required" }, { status: 400 });
  }

  const result = await createManualSuggestion({
    recipientUid,
    candidateUid: body.candidateUid,
    adminUid: admin.uid,
    adminEmail: admin.email,
    note: body.note ?? null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, hardFilterFailures: result.hardFilterFailures, pairHistoryReason: result.pairHistoryReason },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, proposalId: result.proposalId, score: result.score });
}
