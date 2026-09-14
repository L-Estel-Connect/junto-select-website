import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { adminDb } from "@/lib/firebase/admin";
import { withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";
import { diagnoseProfileStatus } from "@/lib/introduction/completion";

export const runtime = "nodejs";

/**
 * Targeted, single-member correction for the exact staleness class
 * `diagnoseProfileStatus` can detect: `meta.profileStatus` was correct the
 * last time some write path (onboarding, preferences/photos/presentation,
 * or the "Sobre ti" self-edit) actually recomputed it, but a schema change
 * since then (a newly required field, a redefined completeness rule)
 * means it no longer matches what the profile's CURRENT data would
 * compute. Never a blanket migration — this only ever touches the one
 * profile a human admin explicitly asked to recheck, and only writes
 * `meta.profileStatus` itself (nothing else), using the exact same
 * `computeProfileStatus` every member-facing save path already uses. A
 * no-op (`changed: false`) when the stored value already matches.
 */
export async function POST(request: Request, context: { params: Promise<{ uid: string }> }) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const { uid } = await context.params;
  const ref = adminDb.doc(`profiles/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 404 });
  }

  const profile = withProfileDefaults(uid, snap.data() as Partial<ProfileDocument>);
  const diagnosis = diagnoseProfileStatus(profile);

  if (!diagnosis.stale) {
    return NextResponse.json({ ok: true, changed: false, status: diagnosis.computedStatus });
  }

  await ref.update({
    "meta.profileStatus": diagnosis.computedStatus,
    "meta.updatedAt": FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    ok: true,
    changed: true,
    previousStatus: diagnosis.storedStatus,
    status: diagnosis.computedStatus,
  });
}
