import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { setShowPhotoInReconnect } from "@/lib/eventReconnect/participants";

export const runtime = "nodejs";

/**
 * The editable "Mostrar mi foto en Reconnect" ON/OFF toggle, usable any
 * time during the active period — see setShowPhotoInReconnect's doc
 * comment for why this is stored on the event participant record and never
 * touches ProfileDocument.photos. Takes effect immediately: the very next
 * discovery.ts read (search/gallery) respects it, never a client-side-only
 * hide.
 */
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.email) return NextResponse.json({ ok: false, error: "no_email" }, { status: 400 });

  const { eventId } = await context.params;
  let body: { show?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.show !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const result = await setShowPhotoInReconnect(eventId, auth.email, body.show);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.error === "not_found" ? 404 : 403 });
  }
  return NextResponse.json({ ok: true });
}
