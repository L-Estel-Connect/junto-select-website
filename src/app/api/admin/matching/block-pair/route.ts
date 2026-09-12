import { NextResponse } from "next/server";
import { isAuthorizedAdminRequest } from "@/lib/matching/adminAuth";
import { blockPair } from "@/lib/matching/pairHistory";

export const runtime = "nodejs";

/**
 * Permanent safety / do-not-match exclusion. `blockPair()` itself has
 * existed since the matching engine was first built, but had no way to
 * actually be invoked outside a manual Firestore write — this is that
 * path. Admin-secret-protected like every other /api/admin/matching/*
 * route, never an unrestricted client write: a Firestore rule alone
 * couldn't express "only a human safety reviewer may do this."
 */
export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { personIdA?: string; personIdB?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { personIdA, personIdB, reason } = body;
  if (!personIdA || !personIdB || !reason?.trim()) {
    return NextResponse.json(
      { ok: false, error: "personIdA_personIdB_and_reason_required" },
      { status: 400 },
    );
  }
  if (personIdA === personIdB) {
    return NextResponse.json({ ok: false, error: "cannot_block_self" }, { status: 400 });
  }

  try {
    await blockPair(personIdA, personIdB, reason.trim());
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Block pair failed:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
