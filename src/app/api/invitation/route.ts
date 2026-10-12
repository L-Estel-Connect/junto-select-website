import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { BrevoConfigError, BrevoRequestError, upsertBrevoContact } from "@/lib/brevo";
import {
  COMMUNITY_INTERESTS,
  type CommunityInterest,
  type CommunityPayload,
} from "@/lib/types";
import { sanitizeSource, validateCommunity } from "@/lib/validation";

export const runtime = "nodejs";

function toPayload(body: unknown): CommunityPayload {
  const source = (body ?? {}) as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  const intereses = Array.isArray(source.intereses)
    ? source.intereses.filter((v): v is CommunityInterest =>
        typeof v === "string" && (COMMUNITY_INTERESTS as readonly string[]).includes(v),
      )
    : [];

  return {
    nombre: str(source.nombre),
    email: str(source.email),
    ciudad: str(source.ciudad) as CommunityPayload["ciudad"],
    ciudadOtra: str(source.ciudadOtra),
    genero: source.genero === "mujer" || source.genero === "hombre" ? source.genero : "",
    rangoEdad: str(source.rangoEdad) as CommunityPayload["rangoEdad"],
    intereses: [...new Set(intereses)],
    aceptaPrivacidad: source.aceptaPrivacidad === true,
    aceptaMarketing: source.aceptaMarketing === true,
    fuente: sanitizeSource(str(source.fuente)),
  };
}

/**
 * "Únete al club" — a Comunidad Junto Select registration. Creates no
 * account and no profile (see CommunityPayload). Firestore is written FIRST
 * and is the system of record, including the timestamped privacy and
 * marketing-consent evidence; Brevo is a best-effort marketing copy that
 * must never turn a captured registration into an error for the visitor.
 *
 * Brevo is only called WITH marketing consent. A registration without it
 * stays in Firestore only (`brevoSyncStatus: "skipped_no_consent"`), so an
 * existing Brevo contact's lists/consent are never touched by someone who
 * did not opt in here.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const payload = toPayload(body);
  const errors = validateCommunity(payload);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  const docRef = adminDb.collection("invitationRequests").doc();
  await docRef.set({
    formVersion: "comunidad_v1",
    nombre: payload.nombre.trim(),
    email: payload.email.trim().toLowerCase(),
    ciudad: payload.ciudad,
    ciudadOtra: payload.ciudad === "otra" ? payload.ciudadOtra.trim() : null,
    genero: payload.genero,
    rangoEdad: payload.rangoEdad,
    intereses: payload.intereses,
    fuente: payload.fuente,
    aceptaPrivacidad: true,
    aceptaPrivacidadAt: FieldValue.serverTimestamp(),
    aceptaMarketing: payload.aceptaMarketing,
    aceptaMarketingAt: payload.aceptaMarketing ? FieldValue.serverTimestamp() : null,
    createdAt: FieldValue.serverTimestamp(),
    brevoSyncStatus: payload.aceptaMarketing ? "pending" : "skipped_no_consent",
    brevoSyncedAt: null,
    brevoSyncError: null,
  });

  if (payload.aceptaMarketing) {
    try {
      await upsertBrevoContact(payload);
      await docRef.update({ brevoSyncStatus: "synced", brevoSyncedAt: FieldValue.serverTimestamp() });
    } catch (error) {
      const message =
        error instanceof BrevoConfigError
          ? "not_configured"
          : error instanceof BrevoRequestError
            ? `upstream_error(${error.status})`
            : "unknown_error";
      console.error(`Community registration ${docRef.id}: Brevo sync failed (${message})`, error);
      await docRef.update({ brevoSyncStatus: "failed", brevoSyncError: message }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
