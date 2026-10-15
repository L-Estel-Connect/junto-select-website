import "server-only";
import { NextResponse } from "next/server";
import { ClientValidationError } from "./validate";

/** Shared by the /api/admin/clients routes. */
export async function readJson(request: Request): Promise<Record<string, unknown> | NextResponse> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }
    return body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
}

export function validationResponse(error: unknown): NextResponse {
  if (error instanceof ClientValidationError) {
    return NextResponse.json({ ok: false, error: error.message, field: error.field }, { status: 400 });
  }
  throw error;
}

export const notFound = () => NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

export function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}
