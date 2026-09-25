import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getPairHistoryDocument } from "@/lib/matching/pairHistory";
import type { IntroductionDocument } from "@/lib/matching/types";
import { eventParticipantId, eventReconnectRequestId, normalizeEmail } from "./identifiers";
import { getEligibleEvent, reconnectWindowState } from "./eventConfig";
import { getEventParticipant } from "./participants";
import {
  MAX_RECONNECT_REQUESTS_PER_EVENT,
  RECONNECT_RESPONSE_WINDOW_HOURS,
  type EventParticipantDocument,
  type EventReconnectRequestDocument,
  type PendingReconnectRequestView,
} from "./types";

export type CreateReconnectRequestResult =
  | { ok: true; requestId: string; requestsRemaining: number }
  | {
      ok: false;
      error:
        | "discovery_closed"
        | "target_not_found"
        | "target_not_visible"
        | "cannot_request_self"
        | "blocked"
        | "limit_reached"
        | "already_requested";
    };

/**
 * The ONLY write path that creates an EventReconnectRequest — everything
 * that matters is verified fresh, server-side, inside one transaction:
 * discovery window, target visibility/consent, the permanent 3-per-event
 * limit, and existing blocked-pair state. Mirrors MemberRunDocument's
 * proposalCount pattern (matching/types.ts) — "the only place the hard
 * max invariant is enforced against concurrent execution" — applied here
 * to the identical class of problem: a counter read-checked-and-incremented
 * inside the same transaction as the thing it gates, so two concurrent
 * requests from the same person can never both slip past the limit.
 */
export async function createReconnectRequest(
  eventId: string,
  requesterUid: string,
  requesterPersonId: string,
  requesterVerifiedEmail: string,
  targetParticipantId: string,
): Promise<CreateReconnectRequestResult> {
  const event = await getEligibleEvent(eventId);
  if (!event || reconnectWindowState(event) !== "open") return { ok: false, error: "discovery_closed" };

  const target = await getEventParticipant(targetParticipantId);
  if (!target || target.eventId !== eventId) return { ok: false, error: "target_not_found" };
  if (!target.visibleForReconnect || !target.acceptsConnectionRequests || !target.claimedUid || !target.claimedPersonId) {
    return { ok: false, error: "target_not_visible" };
  }
  // Narrowed and re-bound to plain non-nullable locals here — the guard
  // above already proved these non-null, but TypeScript's control-flow
  // narrowing doesn't cross into the transaction callback closure below.
  const targetPersonId = target.claimedPersonId;
  const targetUid = target.claimedUid;
  if (targetPersonId === requesterPersonId) return { ok: false, error: "cannot_request_self" };

  const blockCheck = await getPairHistoryDocument(requesterPersonId, targetPersonId);
  if (blockCheck?.state === "blocked") return { ok: false, error: "blocked" };

  const requesterParticipantRef = adminDb.doc(
    `eventParticipants/${eventParticipantId(eventId, normalizeEmail(requesterVerifiedEmail))}`,
  );
  const requestRef = adminDb.doc(`eventReconnectRequests/${eventReconnectRequestId(eventId, requesterPersonId, targetPersonId)}`);

  return adminDb.runTransaction(async (tx) => {
    const [requesterSnap, existingRequestSnap] = await Promise.all([tx.get(requesterParticipantRef), tx.get(requestRef)]);
    if (!requesterSnap.exists) return { ok: false, error: "target_not_found" as const };
    const requester = requesterSnap.data() as EventParticipantDocument;

    if (existingRequestSnap.exists) {
      // Idempotent: a retried click on the same target never creates a
      // second request or consumes a second slot from the allowance.
      return {
        ok: false,
        error: "already_requested" as const,
      };
    }

    if (requester.requestsSent >= MAX_RECONNECT_REQUESTS_PER_EVENT) {
      return { ok: false, error: "limit_reached" as const };
    }

    const now = FieldValue.serverTimestamp();
    const responseDeadline = Timestamp.fromMillis(Date.now() + RECONNECT_RESPONSE_WINDOW_HOURS * 3600 * 1000);
    const requestDoc: EventReconnectRequestDocument = {
      eventId,
      personIdLow: [requesterPersonId, targetPersonId].sort()[0],
      personIdHigh: [requesterPersonId, targetPersonId].sort()[1],
      initiatorPersonId: requesterPersonId,
      initiatorUid: requesterUid,
      recipientPersonId: targetPersonId,
      recipientUid: targetUid,
      status: "pending",
      createdAt: now,
      responseDeadline,
      decidedAt: null,
    };
    tx.create(requestRef, requestDoc);
    tx.update(requesterParticipantRef, { requestsSent: requester.requestsSent + 1, updatedAt: now });

    return { ok: true as const, requestId: requestRef.id, requestsRemaining: MAX_RECONNECT_REQUESTS_PER_EVENT - (requester.requestsSent + 1) };
  });
}

/**
 * Every request still awaiting THIS caller's action or awaiting the OTHER
 * side's action — never a re-opening of the gallery/search, exactly the
 * distinction the audit calls for. Lazily expires anything past its own
 * responseDeadline at read time (no scheduler needed — see the audit):
 * a pending request past its deadline is transitioned to "expired" here
 * and simply excluded from the result, never surfaced as a live item to
 * either party.
 */
export async function listPendingReconnectRequestsForMember(personId: string): Promise<PendingReconnectRequestView[]> {
  const [asLow, asHigh] = await Promise.all([
    adminDb.collection("eventReconnectRequests").where("personIdLow", "==", personId).where("status", "==", "pending").get(),
    adminDb.collection("eventReconnectRequests").where("personIdHigh", "==", personId).where("status", "==", "pending").get(),
  ]);
  const docs = [...asLow.docs, ...asHigh.docs];

  const results: PendingReconnectRequestView[] = [];
  for (const doc of docs) {
    const data = doc.data() as EventReconnectRequestDocument;
    const deadline = (data.responseDeadline as Timestamp).toMillis();
    if (Date.now() >= deadline) {
      await doc.ref.update({ status: "expired", decidedAt: FieldValue.serverTimestamp() });
      continue;
    }

    const isInitiator = data.initiatorPersonId === personId;
    const otherUid = isInitiator ? data.recipientUid : data.initiatorUid;
    const event = await getEligibleEvent(data.eventId);
    const otherProfileSnap = await adminDb.doc(`profiles/${otherUid}`).get();
    const otherFirstName = (otherProfileSnap.data()?.visible?.firstName as string | undefined) || "—";

    results.push({
      id: doc.id,
      eventId: data.eventId,
      eventLabel: event?.label ?? "",
      direction: isInitiator ? "sent" : "received",
      otherFirstName,
      responseDeadline: data.responseDeadline,
    });
  }
  return results;
}

export type DecideReconnectRequestResult =
  | { ok: true; status: "accepted" | "declined" }
  | { ok: false; error: "not_found" | "not_your_request" | "already_decided" | "expired" };

/**
 * Accept/decline — the recipient only (an initiator canceling their own
 * sent request is deliberately not built for V1, see the report: it isn't
 * needed for the product principle and a cancel path would need its own
 * careful thought about whether it refunds the allowance, which it must
 * NOT per the explicit product rule). On accept, creates a real
 * IntroductionDocument tagged source:"event" — from that point on this
 * pair is governed by the IDENTICAL Connexiones/contact-reveal pipeline as
 * an algorithmic introduction; nothing else about that pipeline changes.
 */
export async function decideReconnectRequest(
  requestId: string,
  deciderUid: string,
  deciderPersonId: string,
  decision: "accept" | "decline",
): Promise<DecideReconnectRequestResult> {
  const requestRef = adminDb.doc(`eventReconnectRequests/${requestId}`);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(requestRef);
    if (!snap.exists) return { ok: false, error: "not_found" as const };
    const data = snap.data() as EventReconnectRequestDocument;

    if (data.recipientPersonId !== deciderPersonId) return { ok: false, error: "not_your_request" as const };
    if (data.status !== "pending") return { ok: false, error: "already_decided" as const };

    const deadline = (data.responseDeadline as Timestamp).toMillis();
    if (Date.now() >= deadline) {
      tx.update(requestRef, { status: "expired", decidedAt: FieldValue.serverTimestamp() });
      return { ok: false, error: "expired" as const };
    }

    const now = FieldValue.serverTimestamp();
    if (decision === "decline") {
      tx.update(requestRef, { status: "declined", decidedAt: now });
      return { ok: true as const, status: "declined" as const };
    }

    const event = await getEligibleEvent(data.eventId);
    const introductionRef = adminDb.doc(`introductions/${requestId}`);
    const introduction: IntroductionDocument = {
      personIdA: data.initiatorPersonId,
      personIdB: data.recipientPersonId,
      uidA: data.initiatorUid,
      uidB: deciderUid,
      createdAt: now,
      contactRevealedAt: null,
      source: "event",
      eventId: data.eventId,
      eventLabel: event?.label ?? "",
    };
    tx.set(introductionRef, introduction);
    tx.update(requestRef, { status: "accepted", decidedAt: now });
    return { ok: true as const, status: "accepted" as const };
  });
}
