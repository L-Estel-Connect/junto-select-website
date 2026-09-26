import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { EventParticipantDocument, EventReconnectRequestDocument } from "./types";

export interface ReconnectAdminSummary {
  participantsImported: number;
  activated: number;
  optedOut: number;
  requestsSent: number;
  accepted: number;
}

/**
 * Read-only counts for the admin screen — same shape as the existing
 * sync-event result summary (attempted/succeeded/failed), deliberately
 * simple: cheap enough to compute on every page load for one event's small
 * participant list, no aggregation pipeline needed at this scale.
 */
export async function getReconnectAdminSummary(eventId: string): Promise<ReconnectAdminSummary> {
  const [participantsSnap, requestsSnap] = await Promise.all([
    adminDb.collection("eventParticipants").where("eventId", "==", eventId).get(),
    adminDb.collection("eventReconnectRequests").where("eventId", "==", eventId).get(),
  ]);

  let activated = 0;
  let optedOut = 0;
  for (const doc of participantsSnap.docs) {
    const data = doc.data() as EventParticipantDocument;
    if (data.visibleForReconnect) activated += 1;
    if (data.status === "opted_out") optedOut += 1;
  }

  let accepted = 0;
  for (const doc of requestsSnap.docs) {
    if ((doc.data() as EventReconnectRequestDocument).status === "accepted") accepted += 1;
  }

  return {
    participantsImported: participantsSnap.size,
    activated,
    optedOut,
    requestsSent: requestsSnap.size,
    accepted,
  };
}
