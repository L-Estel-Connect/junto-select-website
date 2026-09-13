import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { BrevoConfigError, BrevoRequestError, upsertBrevoContact } from "@/lib/brevo";
import type { InvitationPayload } from "@/lib/types";
import { validateInvitation } from "@/lib/validation";

export const runtime = "nodejs";

function toPayload(body: unknown): InvitationPayload {
  const source = (body ?? {}) as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === "string" ? value : "");

  return {
    nombre: str(source.nombre),
    genero: source.genero === "mujer" || source.genero === "hombre" ? source.genero : "",
    profesion: str(source.profesion),
    email: str(source.email),
    telefono: str(source.telefono),
    confirmaEdad: source.confirmaEdad === true,
    sobreTi: str(source.sobreTi),
    aceptaComunicaciones: source.aceptaComunicaciones === true,
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const payload = toPayload(body);
  const errors = validateInvitation(payload);

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  /**
   * Firestore is written FIRST and is the system of record for this
   * submission — including the timestamped evidence of the age
   * confirmation and communications consent the person just gave.
   * Previously this route had no persistence of its own at all: the
   * ENTIRE submission existed only as a Brevo API call, so a temporarily
   * misconfigured or unreachable Brevo (or an unrecognized attribute)
   * meant the request was lost with no record anywhere and no recovery
   * path. Now, a Brevo failure below is a sync problem to fix, not a lost
   * submission — this document is what makes the invitation request
   * durable regardless of Brevo's state (see the September/October 2026
   * operational audit's P0 findings).
   */
  const docRef = adminDb.collection("invitationRequests").doc();
  await docRef.set({
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
    brevoSyncStatus: "pending",
    brevoSyncedAt: null,
    brevoSyncError: null,
  });

  // Brevo is best-effort from here: it must never turn a captured
  // submission into a technical failure the person sees (see the
  // Brevo-failure-behavior requirement in the same audit). Any failure is
  // recorded on the document for admin visibility/manual retry instead of
  // surfaced to the user.
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
    console.error(`Invitation submission ${docRef.id}: Brevo sync failed (${message})`, error);
    await docRef
      .update({ brevoSyncStatus: "failed", brevoSyncError: message })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
