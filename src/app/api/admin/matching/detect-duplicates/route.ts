import { NextResponse } from "next/server";
import { isAuthorizedAdminRequest } from "@/lib/matching/adminAuth";
import { detectDuplicateCandidates } from "@/lib/matching/duplicates";

export const runtime = "nodejs";

/**
 * Scans all profiles for shared normalized identifiers / exact photo
 * hashes and upserts scored `duplicateCandidates` entries for review. Only
 * ever writes to that review queue — never changes a profile's
 * duplicateStatus. Safe to rerun (idempotent upserts).
 */
export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await detectDuplicateCandidates();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Duplicate detection failed:", error);
    return NextResponse.json({ ok: false, error: "detection_failed" }, { status: 500 });
  }
}
