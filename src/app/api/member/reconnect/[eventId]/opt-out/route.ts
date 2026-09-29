import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { optOutEventParticipant } from "@/lib/eventReconnect/participants";
import { cancelPendingRequestsForParticipant } from "@/lib/eventReconnect/requests";

export const runtime = "nodejs";

/**
 * "No quiero participar" — the destructive alternative to activation
 * offered on the same landing screen. Scoped exclusively to this one
 * event's Reconnect participation (see optOutEventParticipant's doc
 * comment: never touches the Junto Select account/profile/membership at
 * all). Every pending request directed at this participant is resolved as
 * declined so nobody is left waiting on someone who has opted out.
 *
 * Only reachable from the "imported" (undecided) state — an already-
 * activated participant gets `already_activated` here, never a retraction
 * (see optOutEventParticipant's doc comment on the terminal state machine).
 */
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.email) return NextResponse.json({ ok: false, error: "no_email" }, { status: 400 });

  const { eventId } = await context.params;

  const result = await optOutEventParticipant(eventId, auth.email);
  if (!result.ok) {
    const status = result.error === "already_activated" ? 409 : 404;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  await cancelPendingRequestsForParticipant(result.participantId).catch((error) => {
    console.error(`reconnect opt-out: failed to cancel pending requests for ${result.participantId}`, error);
  });

  return NextResponse.json({ ok: true });
}
