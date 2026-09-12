import { NextResponse } from "next/server";
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

  try {
    await upsertBrevoContact(payload);
  } catch (error) {
    if (error instanceof BrevoConfigError) {
      console.error("Invitation submission failed: Brevo is not configured.");
      return NextResponse.json(
        { ok: false, error: "not_configured" },
        { status: 503 },
      );
    }

    if (error instanceof BrevoRequestError) {
      console.error(
        `Invitation submission failed: Brevo responded with status ${error.status}.`,
      );
      return NextResponse.json(
        { ok: false, error: "upstream_error" },
        { status: 502 },
      );
    }

    console.error("Invitation submission failed: unexpected error.");
    return NextResponse.json(
      { ok: false, error: "unknown_error" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
