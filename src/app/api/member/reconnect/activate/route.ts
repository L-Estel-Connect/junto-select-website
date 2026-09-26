import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { activateReconnect } from "@/lib/eventReconnect/activation";
import type { ContactMethod } from "@/lib/introduction/types";

export const runtime = "nodejs";

const VALID_CONTACT_METHODS: ContactMethod[] = ["whatsapp", "telefono", "email", "instagram", "linkedin"];

/**
 * Activates Reconnect for one event — first name, one photo, a contact
 * method, and (implicitly, by calling this endpoint at all from the
 * consent-gated UI) explicit consent. Every actual minimum-field check
 * happens inside activateReconnect itself, server-side, never trusting
 * this route's own validation as the source of truth — this route only
 * shapes the request body and translates the result.
 */
export async function POST(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.email) return NextResponse.json({ ok: false, error: "no_email" }, { status: 400 });

  let body: {
    eventId?: unknown;
    firstName?: unknown;
    photoPath?: unknown;
    showPhotoInReconnect?: unknown;
    birthDateISO?: unknown;
    contactMethod?: unknown;
    contactValue?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.eventId !== "string" || !body.eventId.trim()) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const contactMethod =
    typeof body.contactMethod === "string" && VALID_CONTACT_METHODS.includes(body.contactMethod as ContactMethod)
      ? (body.contactMethod as ContactMethod)
      : null;

  const result = await activateReconnect({
    eventId: body.eventId.trim(),
    uid: auth.uid,
    verifiedEmail: auth.email,
    firstName: typeof body.firstName === "string" && body.firstName.trim() ? body.firstName.trim() : null,
    photoPath: typeof body.photoPath === "string" && body.photoPath.trim() ? body.photoPath.trim() : null,
    showPhotoInReconnect: body.showPhotoInReconnect === true,
    birthDateISO: typeof body.birthDateISO === "string" && body.birthDateISO.trim() ? body.birthDateISO.trim() : null,
    contactMethod,
    contactValue: typeof body.contactValue === "string" && body.contactValue.trim() ? body.contactValue.trim() : null,
  });

  if (!result.ok) {
    const status = result.error === "claimed_by_other" ? 409 : result.error === "event_not_participant" ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
