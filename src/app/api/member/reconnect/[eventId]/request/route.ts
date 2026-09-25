import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { adminDb } from "@/lib/firebase/admin";
import { withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";
import { resolvePersonId } from "@/lib/matching/identity";
import { createReconnectRequest } from "@/lib/eventReconnect/requests";
import { queueOutboundEmail } from "@/lib/notifications/outboundEmails";
import { getEventParticipant } from "@/lib/eventReconnect/participants";
import { getEligibleEvent } from "@/lib/eventReconnect/eventConfig";

export const runtime = "nodejs";

/**
 * Sends one Reconnect request — every safety property (discovery window,
 * target consent, the permanent 3-per-event limit, blocked-pair state) is
 * enforced transactionally inside createReconnectRequest, never here; this
 * route only resolves the caller's identity and translates the result.
 */
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.email) return NextResponse.json({ ok: false, error: "no_email" }, { status: 400 });

  const { eventId } = await context.params;
  let body: { targetParticipantId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.targetParticipantId !== "string" || !body.targetParticipantId.trim()) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const profileSnap = await adminDb.doc(`profiles/${auth.uid}`).get();
  if (!profileSnap.exists) return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 400 });
  const profile = withProfileDefaults(auth.uid, profileSnap.data() as Partial<ProfileDocument>);
  const personId = resolvePersonId(auth.uid, profile);

  const result = await createReconnectRequest(eventId, auth.uid, personId, auth.email, body.targetParticipantId.trim());
  if (!result.ok) {
    const status = result.error === "limit_reached" || result.error === "discovery_closed" ? 403 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  // Best-effort, one-time-per-event notification for a target who hasn't
  // activated yet — see EventParticipantDocument.invitationEmailSentAt.
  // Never allowed to affect the request's own success/failure.
  void notifyUnactivatedTargetIfNeeded(eventId, body.targetParticipantId.trim()).catch((error) => {
    console.error(`reconnect request: failed to queue activation-invite email for ${body.targetParticipantId}`, error);
  });

  return NextResponse.json({ ok: true, requestsRemaining: result.requestsRemaining });
}

async function notifyUnactivatedTargetIfNeeded(eventId: string, targetParticipantId: string): Promise<void> {
  const target = await getEventParticipant(targetParticipantId);
  if (!target || target.visibleForReconnect || target.invitationEmailSentAt) return;
  const event = await getEligibleEvent(eventId);
  await queueOutboundEmail(
    {
      type: "event_reconnect_invite",
      uid: null,
      email: target.normalizedEmail,
      data: { eventLabel: event?.label ?? "", eventId },
    },
    `event_reconnect_invite_${targetParticipantId}`,
  );
  await adminDb.doc(`eventParticipants/${targetParticipantId}`).update({ invitationEmailSentAt: new Date() });
}
