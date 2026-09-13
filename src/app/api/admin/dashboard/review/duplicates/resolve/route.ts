import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { adminDb } from "@/lib/firebase/admin";
import { mergePeople } from "@/lib/matching/identity";

export const runtime = "nodejs";

/**
 * Two admin actions on a `duplicateCandidates` entry (spec §13): "Confirm
 * duplicate" merges the pair via the existing, already-audited
 * `mergePeople` (the admin picks which uid is primary — never inferred);
 * "Mark not duplicate" just dismisses the queue entry. Neither ever does
 * unsafe direct database editing — both go through the same functions the
 * secret-protected automation routes already use.
 */
export async function POST(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  let body: {
    candidateId?: string;
    action?: "merge" | "dismiss";
    primaryUid?: string;
    secondaryUid?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { candidateId, action, primaryUid, secondaryUid } = body;
  if (!candidateId) {
    return NextResponse.json({ ok: false, error: "candidateId_required" }, { status: 400 });
  }

  const ref = adminDb.doc(`duplicateCandidates/${candidateId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    if (action === "merge") {
      if (!primaryUid || !secondaryUid) {
        return NextResponse.json({ ok: false, error: "primaryUid_and_secondaryUid_required" }, { status: 400 });
      }
      await mergePeople(primaryUid, secondaryUid);
      await ref.update({ status: "merged" });
    } else {
      await ref.update({ status: "dismissed" });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Resolving duplicate candidate failed:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
