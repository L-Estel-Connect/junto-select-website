import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { decideInvitationForMember } from "@/lib/matching/memberLifecycle";
import type { PassType } from "@/lib/matching/types";

export const runtime = "nodejs";

/**
 * The candidate's Stage-2 decision ("Me interesa" / "Pasar") on an
 * invitation — free, no membership required either to view or to answer.
 * Same pattern as the proposal decide route: re-verifies
 * `invitation.recipientUid === uid` server-side, then delegates to the
 * existing `recordCandidateDecision`, which is the one and only place a
 * mutual introduction is created.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;

  let body: { decision?: string; passType?: PassType };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { decision, passType } = body;
  if (decision !== "interested" && decision !== "passed") {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const result = await decideInvitationForMember(auth.uid, id, decision, passType ?? null);
  if (!result.ok) {
    const status = result.error === "not_your_proposal" ? 403 : result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, alreadyRecorded: result.alreadyRecorded });
}
