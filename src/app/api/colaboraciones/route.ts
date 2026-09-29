import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { queueOutboundEmail } from "@/lib/notifications/outboundEmails";
import { collaborationTypeOptions, type CollaborationPayload } from "@/lib/collaborations/types";
import { validateCollaboration } from "@/lib/collaborations/validation";

export const runtime = "nodejs";

/**
 * The existing, already-public Junto Select contact address (see
 * aviso-legal, privacidad, terminos, and SettingsSection's own delete-
 * profile error message) — reused here rather than inventing a new inbox,
 * so a collaboration inquiry lands exactly where every other real-world
 * "write to us" channel on this site already points.
 */
const COLLABORATION_RECIPIENT_EMAIL = "juntoselect@gmail.com";

function toPayload(body: unknown): CollaborationPayload {
  const source = (body ?? {}) as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  const tipo = str(source.tipoColaboracion);

  return {
    nombre: str(source.nombre),
    marca: str(source.marca),
    email: str(source.email),
    instagramOWeb: str(source.instagramOWeb),
    tipoColaboracion:
      tipo === "partner_evento" || tipo === "producto_experiencia" || tipo === "a_medida" || tipo === "otra" ? tipo : "",
    mensaje: str(source.mensaje),
    website: str(source.website),
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const payload = toPayload(body);

  // Honeypot: a real visitor never sees or fills this field (see
  // CollaborationForm). Respond exactly as if the submission succeeded —
  // never reveal to a bot that it was caught — but do no further work.
  if (payload.website.trim()) {
    return NextResponse.json({ ok: true });
  }

  const errors = validateCollaboration(payload);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  const { nombre, marca, email, instagramOWeb, tipoColaboracion, mensaje } = payload;
  const tipoColaboracionLabel =
    collaborationTypeOptions.find((option) => option.value === tipoColaboracion)?.label ?? tipoColaboracion;

  /**
   * Firestore first, same "durable system of record regardless of Brevo's
   * state" pattern as /api/invitation's invitationRequests — this document
   * is what makes the inquiry recoverable even if email delivery is
   * temporarily broken. This is a one-off business inquiry, never a
   * newsletter signup: no aceptaComunicaciones field exists, and nothing
   * here calls upsertBrevoContact (the marketing-list integration) —
   * submitting a proposal is not consent to marketing.
   */
  const docRef = adminDb.collection("collaborationInquiries").doc();
  await docRef.set({
    nombre: nombre.trim(),
    marca: marca.trim(),
    email: email.trim(),
    instagramOWeb: instagramOWeb.trim(),
    tipoColaboracion,
    mensaje: mensaje.trim(),
    createdAt: FieldValue.serverTimestamp(),
    notificationQueued: false,
    notificationQueueError: null,
  });

  try {
    await queueOutboundEmail(
      {
        type: "collaboration_proposal",
        uid: null,
        email: COLLABORATION_RECIPIENT_EMAIL,
        data: {
          nombre: nombre.trim(),
          marca: marca.trim(),
          email: email.trim(),
          instagramOWeb: instagramOWeb.trim(),
          tipoColaboracionLabel,
          mensaje: mensaje.trim(),
        },
      },
      // Ties the queued email 1:1 to this inquiry doc, so a client retry of
      // the SAME already-recorded inquiry (e.g. a slow response the user
      // resubmits) can never queue a second email for it.
      `collaboration_${docRef.id}`,
    );
    await docRef.update({ notificationQueued: true });
  } catch (error) {
    // Never turn a captured inquiry into a technical failure the visitor
    // sees — recorded for admin visibility/manual follow-up instead, same
    // Brevo-failure-behavior convention as /api/invitation.
    console.error(`Collaboration inquiry ${docRef.id}: failed to queue notification email`, error);
    await docRef.update({ notificationQueueError: error instanceof Error ? error.message : "unknown_error" }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
