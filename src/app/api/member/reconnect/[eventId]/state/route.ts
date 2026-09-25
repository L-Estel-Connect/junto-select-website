import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getReconnectStateForCaller } from "@/lib/eventReconnect/discovery";

export const runtime = "nodejs";

/**
 * Tells the client which of the four Reconnect states it's in for this
 * event — not_yet_open / open / discovery_closed, plus whether the caller
 * is even a participant and whether they've activated. Always computed
 * fresh, server-side, from `now` — the client never trusts its own clock
 * for whether discovery is open (see the audit's security requirements).
 */
export async function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.email) return NextResponse.json({ ok: false, error: "no_email" }, { status: 400 });

  const { eventId } = await context.params;
  const state = await getReconnectStateForCaller(eventId, auth.email);
  if ("error" in state) return NextResponse.json({ ok: false, error: state.error }, { status: 404 });

  return NextResponse.json({ ok: true, state });
}
