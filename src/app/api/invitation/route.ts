import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { BrevoConfigError, BrevoRequestError, upsertBrevoContact } from "@/lib/brevo";
import { isStagingDeploy } from "@/lib/config/deployEnv";
import {
  COMMUNITY_CONSENT,
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
    telefono: str(source.telefono),
    empresa: str(source.empresa),
    genero: source.genero === "mujer" || source.genero === "hombre" ? source.genero : "",
    rangoEdad: str(source.rangoEdad) as CommunityPayload["rangoEdad"],
    intereses: [...new Set(intereses)],
    aceptaInvitaciones: source.aceptaInvitaciones === true,
    fuente: sanitizeSource(str(source.fuente)),
  };
}

/**
 * "Recibir invitaciones" — a Comunidad Junto Select registration. Creates
 * no account and no profile (see CommunityPayload). Firestore is written
 * FIRST and is the system of record, including the timestamped consent and
 * the exact wording agreed to (COMMUNITY_CONSENT); Brevo is a copy that
 * must never turn a captured registration into an error for the visitor.
 *
 * The form's one required box is the consent to receive invitations, so
 * every valid registration is synced to Brevo (except on staging, which
 * never calls Brevo). Brevo adds the unsubscribe link to every campaign.
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
  const staging = isStagingDeploy();
  await docRef.set({
    formVersion: "comunidad_v2",
    nombre: payload.nombre.trim(),
    email: payload.email.trim().toLowerCase(),
    ciudad: payload.ciudad,
    ciudadOtra: payload.ciudad === "otra" ? payload.ciudadOtra.trim() : null,
    telefono: payload.telefono.trim() || null,
    empresa: payload.empresa.trim() || null,
    genero: payload.genero,
    rangoEdad: payload.rangoEdad,
    intereses: payload.intereses,
    fuente: payload.fuente,
    consentVersion: COMMUNITY_CONSENT.version,
    consentText: COMMUNITY_CONSENT.text,
    // The one box covers both the privacy notice and the invitations, so
    // both historical flags stay true for anything that reads them.
    aceptaPrivacidad: true,
    aceptaPrivacidadAt: FieldValue.serverTimestamp(),
    aceptaMarketing: true,
    aceptaMarketingAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    brevoSyncStatus: staging ? "skipped_staging" : "pending",
    brevoSyncedAt: null,
    brevoSyncError: null,
  });

  if (!staging) {
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
