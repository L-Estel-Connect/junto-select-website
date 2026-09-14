import "server-only";
import { adminDb } from "@/lib/firebase/admin";

/**
 * Whether `callerUid` is authorized to view `targetUid`'s PUBLIC profile
 * fields (via buildPublicProfileView) — the one gate every member-facing
 * lifecycle read (proposals, invitations, introductions, and the photo
 * route below) goes through before ever returning another person's data.
 * Never based on anything the client asserts: always re-derived from the
 * actual proposals/invitations/introductions documents, the same
 * Admin-SDK reads the lifecycle routes themselves use.
 *
 * Three, and only three, legitimate relationships:
 *  - `callerUid` is the RECIPIENT of a proposal naming `targetUid` as the
 *    candidate (any stage — a member can see who was proposed to them from
 *    the moment it's created, not just after deciding).
 *  - `callerUid` is the RECIPIENT of an invitation whose `inviterUid` is
 *    `targetUid` (an invitation only ever exists once the inviter already
 *    said Interested, so this is always safe to show).
 *  - `callerUid` and `targetUid` are the two parties of an introduction.
 * Viewing your own profile is trivially authorized too.
 */
export async function isAuthorizedToViewProfile(callerUid: string, targetUid: string): Promise<boolean> {
  if (callerUid === targetUid) return true;

  const [asRecipient, asInvitee, introAsA, introAsB] = await Promise.all([
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
  ]);

  return !asRecipient.empty || !asInvitee.empty || !introAsA.empty || !introAsB.empty;
}
