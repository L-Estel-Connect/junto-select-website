import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { isInquiryStatus } from "@/lib/matchmaking/inquiry";
import { clientFromInquiry } from "@/lib/clients/fromInquiry";

export const runtime = "nodejs";

/**
 * Updates a matchmaking application's status and/or internal note.
 * Setting "cliente" is never just a label: it creates (or links) the
 * client record, exactly like "Convertir en cliente".
 */
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
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  // A converted request keeps its "Cliente" status: the client record is the source of truth now.
  if (update.status !== undefined && update.status !== "cliente" && typeof snap.get("clientId") === "string") {
    return NextResponse.json({ ok: false, error: "already_client" }, { status: 409 });
  }
  let clientId: string | null = null;
  if (update.status === "cliente") {
    const result = await clientFromInquiry(id, admin.email);
    if (!result) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    clientId = result.client.id;
    delete update.status;
    delete update.statusUpdatedBy;
  }
  if (Object.keys(update).length > 0) await ref.update({ ...update, updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true, clientId });
}
