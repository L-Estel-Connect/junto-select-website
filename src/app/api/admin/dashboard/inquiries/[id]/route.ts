import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { isInquiryStatus } from "@/lib/matchmaking/inquiry";

export const runtime = "nodejs";

/** Updates a matchmaking application's status and/or internal note. Nothing else is editable. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!isInquiryStatus(body.status)) return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
    update.status = body.status;
    update.statusUpdatedBy = admin.email;
  }
  if (body.note !== undefined) {
    if (typeof body.note !== "string" || body.note.length > 4000)
      return NextResponse.json({ ok: false, error: "invalid_note" }, { status: 400 });
    update.note = body.note;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });

  const ref = adminDb.collection("matchmakingInquiries").doc(id);
  if (!(await ref.get()).exists) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  await ref.update({ ...update, updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true });
}
