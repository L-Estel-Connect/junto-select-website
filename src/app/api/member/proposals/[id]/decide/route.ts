import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { decideProposalForMember } from "@/lib/matching/memberLifecycle";
import type { PassType } from "@/lib/matching/types";

export const runtime = "nodejs";

/**
 * The recipient's Stage-1 decision ("Me interesa" / "Pasar") on a
 * proposal — the ONLY member-authenticated write in this lifecycle.
 * `decideProposalForMember` re-verifies `proposal.recipientUid === uid`
 * itself (never trusts the `:id` path segment alone), then delegates to
 * the existing, already-tested `recordMemberDecision` — this route adds
 * no new lifecycle logic, only a safe, member-authenticated door to it.
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

  const result = await decideProposalForMember(auth.uid, id, decision, passType ?? null);
  if (!result.ok) {
    const status = result.error === "not_your_proposal" ? 403 : result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, alreadyRecorded: result.alreadyRecorded });
}
