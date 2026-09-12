import { NextResponse } from "next/server";
import { isAuthorizedAdminRequest } from "@/lib/matching/adminAuth";
import { recordCandidateDecision } from "@/lib/matching/pairHistory";
import type { PassType } from "@/lib/matching/types";

export const runtime = "nodejs";

/**
 * Stage 2 decision: the invited (possibly passive/free) candidate
 * responds "Me interesa" or "No, gracias" — free, no payment required.
 * "interested" here is the one place a mutual introduction gets created,
 * when the originating proposal was also Interested. Server-side
 * validated and idempotent, same as proposal-decision. Admin-secret
 * protected for the same reason: no member-facing invitations UI exists
 * yet — a real one would verify the caller's uid against the invitation's
 * recipientUid.
 */
export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { invitationId?: string; decision?: string; passType?: PassType };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { invitationId, decision, passType } = body;
  if (!invitationId || (decision !== "interested" && decision !== "passed")) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  try {
    const result = await recordCandidateDecision(invitationId, decision, passType ?? null);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Recording candidate decision failed:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
