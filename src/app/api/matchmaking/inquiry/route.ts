import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { queueOutboundEmail } from "@/lib/notifications/outboundEmails";
import { CURRENT_PRIVACY_VERSION } from "@/lib/legal/versions";
import { CONTACT_EMAIL } from "@/lib/site/content";
import {
  CHANNEL_OPTIONS,
  OBJECTIVE_OPTIONS,
  PROGRAMME_OPTIONS,
  labelOf,
  toInquiryPayload,
  validateInquiry,
} from "@/lib/matchmaking/inquiry";

export const runtime = "nodejs";

/**
 * Private matchmaking application from /matchmaking. Same pattern as
 * /api/colaboraciones: the Firestore record first (the system of record,
 * shown to the team in /admin/solicitudes), then two queued emails, a
 * team alert and a short acknowledgement to the applicant. Never creates
 * an account, an Introducciones profile, a Brevo contact or a payment, and
 * is not consent to marketing. On staging, Brevo is blocked by the
 * isolation guard, so the emails stay queued.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const p = toInquiryPayload(body);
  if (p.website.trim()) return NextResponse.json({ ok: true });

  const errors = validateInquiry(p);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  const record = {
    nombre: p.nombre.trim(),
    apellidos: p.apellidos.trim(),
    email: p.email.trim().toLowerCase(),
    telefono: p.telefono.trim(),
    canal: p.canal,
    edad: Number(p.edad.trim()),
    ciudad: p.ciudad.trim(),
    programa: p.programa,
    objetivo: p.objetivo,
    edadDesde: Number(p.edadDesde.trim()),
    edadHasta: Number(p.edadHasta.trim()),
    busca: p.busca.trim(),
    privacyVersion: CURRENT_PRIVACY_VERSION,
    status: "nueva",
    note: "",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    notificationQueued: false,
    notificationQueueError: null as string | null,
  };
  const docRef = adminDb.collection("matchmakingInquiries").doc();
  await docRef.set(record);

  const summary = {
    nombre: `${record.nombre} ${record.apellidos}`,
    email: record.email,
    telefono: record.telefono,
    canal: labelOf(CHANNEL_OPTIONS, record.canal),
    edad: String(record.edad),
    ciudad: record.ciudad,
    programa: labelOf(PROGRAMME_OPTIONS, record.programa),
    objetivo: labelOf(OBJECTIVE_OPTIONS, record.objetivo),
    rango: `${record.edadDesde}–${record.edadHasta}`,
    busca: record.busca,
  };
  try {
    await queueOutboundEmail(
      { type: "matchmaking_inquiry", uid: null, email: CONTACT_EMAIL, data: summary },
      `matchmaking_inquiry_${docRef.id}`,
    );
    await queueOutboundEmail(
      {
        type: "matchmaking_inquiry_received",
        uid: null,
        email: record.email,
        data: { nombre: record.nombre, programa: record.programa },
      },
      `matchmaking_inquiry_received_${docRef.id}`,
    );
    await docRef.update({ notificationQueued: true });
  } catch (error) {
    // The request is recorded; a queueing failure never reaches the visitor.
    console.error(`Matchmaking inquiry ${docRef.id}: failed to queue emails`, error);
    await docRef
      .update({ notificationQueueError: error instanceof Error ? error.message : "unknown_error" })
      .catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
