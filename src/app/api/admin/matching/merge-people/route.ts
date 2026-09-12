import { NextResponse } from "next/server";
import { isAuthorizedAdminRequest } from "@/lib/matching/adminAuth";
import { mergePeople } from "@/lib/matching/identity";

export const runtime = "nodejs";

/**
 * Links a secondary/duplicate account to a primary one — the only way
 * `duplicateStatus` becomes `confirmed_duplicate` and the only writer of
 * `people/{personId}`. Deliberately a manual, explicit call (no
 * self-service UI yet): see README for why this is V1's account-linking
 * mechanism rather than an automated merge.
 */
export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { primaryUid?: string; secondaryUid?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { primaryUid, secondaryUid } = body;
  if (!primaryUid || !secondaryUid) {
    return NextResponse.json(
      { ok: false, error: "primaryUid_and_secondaryUid_required" },
      { status: 400 },
    );
  }

  try {
    await mergePeople(primaryUid, secondaryUid);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Merge people failed:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
