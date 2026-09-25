import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { getEligibleEvent, reconnectWindowState } from "@/lib/eventReconnect/eventConfig";
import type { EventParticipantDocument } from "@/lib/eventReconnect/types";

/**
 * Reconnect's own two legitimate photo-visibility relationships, kept as a
 * private helper rather than inlined below so the main list of relationships
 * stays scannable. Either is sufficient:
 *  - An `eventReconnectRequest` already exists between these two uids (any
 *    status) — the requester was legitimately shown the target's photo at
 *    request time, and the recipient needs to see the requester's photo to
 *    decide, even after discovery has closed and the request is only in its
 *    72h response window (see requests.ts).
 *  - Both are currently activated, consenting participants of the SAME
 *    event and that event's 48h discovery window is open right now — this
 *    is what makes search/gallery photos visible before any request exists.
 *    Re-derived fresh every call, never a client-asserted claim.
 */
async function hasReconnectVisibility(callerUid: string, targetUid: string): Promise<boolean> {
  const [asInitiator, asRecipient] = await Promise.all([
    adminDb
      .collection("eventReconnectRequests")
      .where("initiatorUid", "==", callerUid)
      .where("recipientUid", "==", targetUid)
      .limit(1)
      .get(),
    adminDb
      .collection("eventReconnectRequests")
      .where("initiatorUid", "==", targetUid)
      .where("recipientUid", "==", callerUid)
      .limit(1)
      .get(),
  ]);
  if (!asInitiator.empty || !asRecipient.empty) return true;

  const [callerParticipations, targetParticipations] = await Promise.all([
    adminDb
      .collection("eventParticipants")
      .where("claimedUid", "==", callerUid)
      .where("visibleForReconnect", "==", true)
      .get(),
    adminDb
      .collection("eventParticipants")
      .where("claimedUid", "==", targetUid)
      .where("visibleForReconnect", "==", true)
      .get(),
  ]);
  const targetEventIds = new Set(
    targetParticipations.docs.map((d) => (d.data() as EventParticipantDocument).eventId),
  );
  const sharedEventIds = callerParticipations.docs
    .map((d) => (d.data() as EventParticipantDocument).eventId)
    .filter((id) => targetEventIds.has(id));

  for (const eventId of sharedEventIds) {
    const event = await getEligibleEvent(eventId);
    if (event && reconnectWindowState(event) === "open") return true;
  }
  return false;
}

/**
 * Whether `callerUid` is authorized to view `targetUid`'s PUBLIC profile
 * fields (via buildPublicProfileView) — the one gate every member-facing
 * lifecycle read (proposals, invitations, introductions, and the photo
 * route below) goes through before ever returning another person's data.
 * Never based on anything the client asserts: always re-derived from the
 * actual proposals/invitations/introductions documents, the same
 * Admin-SDK reads the lifecycle routes themselves use.
 *
 * Legitimate relationships:
 *  - `callerUid` is the RECIPIENT of a proposal naming `targetUid` as the
 *    candidate (any stage — a member can see who was proposed to them from
 *    the moment it's created, not just after deciding).
 *  - `callerUid` is the RECIPIENT of an invitation whose `inviterUid` is
 *    `targetUid` (an invitation only ever exists once the inviter already
 *    said Interested, so this is always safe to show).
 *  - `callerUid` and `targetUid` are the two parties of an introduction
 *    (algorithmic OR event-sourced — introductions don't distinguish here).
 *  - `callerUid` and `targetUid` share a Reconnect relationship — see
 *    hasReconnectVisibility above.
 * Viewing your own profile is trivially authorized too.
 */
export async function isAuthorizedToViewProfile(callerUid: string, targetUid: string): Promise<boolean> {
  if (callerUid === targetUid) return true;

  const [asRecipient, asInvitee, introAsA, introAsB, reconnectVisible] = await Promise.all([
    adminDb
      .collection("proposals")
      .where("recipientUid", "==", callerUid)
      .where("candidateUid", "==", targetUid)
      .limit(1)
      .get(),
    adminDb
      .collection("invitations")
      .where("recipientUid", "==", callerUid)
      .where("inviterUid", "==", targetUid)
      .limit(1)
      .get(),
    adminDb
      .collection("introductions")
      .where("uidA", "==", callerUid)
      .where("uidB", "==", targetUid)
      .limit(1)
      .get(),
    adminDb
      .collection("introductions")
      .where("uidA", "==", targetUid)
      .where("uidB", "==", callerUid)
      .limit(1)
      .get(),
    hasReconnectVisibility(callerUid, targetUid),
  ]);

  return !asRecipient.empty || !asInvitee.empty || !introAsA.empty || !introAsB.empty || reconnectVisible;
}
