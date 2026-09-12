import { NextResponse } from "next/server";
import { isAuthorizedAdminRequest } from "@/lib/matching/adminAuth";
import { recordMemberDecision } from "@/lib/matching/pairHistory";
import type { PassType } from "@/lib/matching/types";

export const runtime = "nodejs";

/**
 * Stage 1 decision: the active/paid member responds "Me interesa" or
 * "Pasar" to a proposal. Server-side validated (stage transition checked
 * inside a transaction) and idempotent (deciding the same way twice is a
 * no-op). Admin-secret-protected for now because there is no
 * member-facing proposals UI yet (Mis propuestas is still a placeholder
 * shell) — a real member-facing endpoint would instead verify a Firebase
 * ID token and check the caller's uid matches the proposal's
 * recipientUid, the same pattern already used by
 * /api/introduction/generate-presentation.
 */
export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { proposalId?: string; decision?: string; passType?: PassType };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { proposalId, decision, passType } = body;
  if (!proposalId || (decision !== "interested" && decision !== "passed")) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  try {
    const result = await recordMemberDecision(proposalId, decision, passType ?? null);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Recording member decision failed:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
