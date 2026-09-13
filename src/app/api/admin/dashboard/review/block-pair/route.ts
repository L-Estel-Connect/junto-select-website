import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { adminDb } from "@/lib/firebase/admin";
import { blockPair } from "@/lib/matching/pairHistory";
import { resolvePersonId } from "@/lib/matching/identity";
import type { ProfileDocument } from "@/lib/introduction/types";

export const runtime = "nodejs";

/**
 * Dashboard-facing wrapper around the existing, already-audited
 * `blockPair()` — authorized via the admin Firebase session (like every
 * other /api/admin/dashboard/* route) rather than the shared automation
 * secret, since this is a human clicking a confirmed button in the UI, not
 * an unattended script.
 */
export async function POST(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  let body: { uidA?: string; uidB?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { uidA, uidB, reason } = body;
  if (!uidA || !uidB || !reason?.trim()) {
    return NextResponse.json({ ok: false, error: "uidA_uidB_and_reason_required" }, { status: 400 });
  }
  if (uidA === uidB) {
    return NextResponse.json({ ok: false, error: "cannot_block_self" }, { status: 400 });
  }

  const [snapA, snapB] = await Promise.all([
    adminDb.doc(`profiles/${uidA}`).get(),
    adminDb.doc(`profiles/${uidB}`).get(),
  ]);
  if (!snapA.exists || !snapB.exists) {
    return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 404 });
  }

  const personIdA = resolvePersonId(uidA, snapA.data() as ProfileDocument);
  const personIdB = resolvePersonId(uidB, snapB.data() as ProfileDocument);
  if (personIdA === personIdB) {
    return NextResponse.json({ ok: false, error: "cannot_block_self" }, { status: 400 });
  }

  try {
    await blockPair(personIdA, personIdB, reason.trim());
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin block-pair failed:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
