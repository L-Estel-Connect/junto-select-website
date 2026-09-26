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
 * discovery window, target validity, the permanent 3-per-event limit, and
 * (when resolvable) existing blocked-pair state. Mirrors MemberRunDocument's
 * proposalCount pattern (matching/types.ts) — "the only place the hard
 * max invariant is enforced against concurrent execution" — applied here
 * to the identical class of problem: a counter read-checked-and-incremented
 * inside the same transaction as the thing it gates, so two concurrent
 * requests from the same person can never both slip past the limit.
 *
 * The target does NOT need to have activated Reconnect yet — expressing
 * interest in an imported-but-not-yet-activated attendee is exactly what
 * the product spec calls for (see types.ts's EventReconnectRequestDocument
 * doc comment for how that's represented: `recipientPersonId`/`recipientUid`
 * stay null until the target activates). It still costs the requester
 * exactly one of their 3 requests, identically to requesting an already-
 * activated participant.
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

  const requesterParticipantId = eventParticipantId(eventId, normalizeEmail(requesterVerifiedEmail));
  // Compared as participant ids, not person ids — this must hold even
  // before the target has activated (and therefore before it has a person
  // id at all), so this is the one self-check that always works.
  if (targetParticipantId === requesterParticipantId) return { ok: false, error: "cannot_request_self" };

  const target = await getEventParticipant(targetParticipantId);
  if (!target || target.eventId !== eventId || target.status === "opted_out") {
    return { ok: false, error: "target_not_found" };
  }

  // Only an ALREADY-ACTIVATED target has a resolvable person id/uid and can
  // be block-checked now; an unactivated target is re-checked for a block
  // at decide time instead (see decideReconnectRequest), once their real
  // identity is known.
  let targetPersonId: string | null = null;
  let targetUid: string | null = null;
  if (target.visibleForReconnect) {
    if (!target.acceptsConnectionRequests || !target.claimedUid || !target.claimedPersonId) {
      return { ok: false, error: "target_not_visible" };
    }
    targetPersonId = target.claimedPersonId;
    targetUid = target.claimedUid;
    if (targetPersonId === requesterPersonId) return { ok: false, error: "cannot_request_self" };

    const blockCheck = await getPairHistoryDocument(requesterPersonId, targetPersonId);
    if (blockCheck?.state === "blocked") return { ok: false, error: "blocked" };
  }

  const requesterParticipantRef = adminDb.doc(`eventParticipants/${requesterParticipantId}`);
  const requestRef = adminDb.doc(
    `eventReconnectRequests/${eventReconnectRequestId(eventId, requesterParticipantId, targetParticipantId)}`,
  );

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
      initiatorParticipantId: requesterParticipantId,
      initiatorPersonId: requesterPersonId,
      initiatorUid: requesterUid,
      targetParticipantId,
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
 * Called once, from activateReconnect, the moment a participant claims
 * their event participant record — backfills `recipientPersonId`/
 * `recipientUid` on every still-pending request that was sent to them
 * BEFORE they activated (see createReconnectRequest: those fields start
 * null for an unactivated target). Until this runs, such a request is
 * invisible to `listPendingReconnectRequestsForMember` by construction —
 * exactly the "can't see it until you activate" requirement. Idempotent:
 * finds nothing to do on a second call (the query itself only matches
 * still-null docs).
 */
export async function resolvePendingRequestsForActivatedParticipant(
  participantId: string,
  uid: string,
  personId: string,
): Promise<void> {
  const snap = await adminDb
    .collection("eventReconnectRequests")
    .where("targetParticipantId", "==", participantId)
    .where("status", "==", "pending")
    .where("recipientPersonId", "==", null)
    .get();
  if (snap.empty) return;

  const batch = adminDb.batch();
  const now = FieldValue.serverTimestamp();
  for (const doc of snap.docs) {
    batch.update(doc.ref, { recipientPersonId: personId, recipientUid: uid, updatedAt: now });
  }
  await batch.commit();
}

/**
 * Whether this (not-yet-activated) participant has a live incoming request
 * — i.e. one still within its own 72h response deadline. Used only to let
 * `getReconnectStateForCaller` allow activation even after the 48h
 * discovery window has otherwise closed, so a request received late in
 * that window doesn't strand its recipient (see the audit's timing-window
 * analysis) — never used to widen anything else.
 */
export async function hasLivePendingIncomingRequest(participantId: string): Promise<boolean> {
  const snap = await adminDb
    .collection("eventReconnectRequests")
    .where("targetParticipantId", "==", participantId)
    .where("status", "==", "pending")
    .get();
  const now = Date.now();
  return snap.docs.some((doc) => {
    const deadline = (doc.data() as EventReconnectRequestDocument).responseDeadline as Timestamp;
    return deadline.toMillis() > now;
  });
}

/**
 * Called when a participant explicitly opts out ("No quiero participar") —
 * every request still pending FOR them is resolved as declined, exactly as
 * if they had seen and declined it themselves: no connection, no contact
 * reveal, and the initiator's already-spent allowance slot is (correctly,
 * per the product rule) never refunded. A request they THEMSELVES sent to
 * someone else is left untouched — opting out only removes this person
 * from discovery and future requests, it doesn't retract what they already
 * did.
 */
export async function cancelPendingRequestsForParticipant(participantId: string): Promise<void> {
  const snap = await adminDb
    .collection("eventReconnectRequests")
    .where("targetParticipantId", "==", participantId)
    .where("status", "==", "pending")
    .get();
  if (snap.empty) return;

  const batch = adminDb.batch();
  const now = FieldValue.serverTimestamp();
  for (const doc of snap.docs) {
    batch.update(doc.ref, { status: "declined", decidedAt: now });
  }
  await batch.commit();
}

/**
 * Every request still awaiting THIS caller's action or awaiting the OTHER
 * side's action — never a re-opening of the gallery/search, exactly the
 * distinction the audit calls for. Queried directly by role (initiator/
 * recipient) rather than a sorted-pair convention — a request is inherently
 * directional (there's always exactly one initiator and one recipient), so
 * there's no ambiguity to resolve by sorting. A request whose
 * `recipientPersonId` is still null (the target hasn't activated yet) never
 * matches either query for ANY personId, by construction — it only starts
 * appearing here once resolvePendingRequestsForActivatedParticipant has
 * run. Lazily expires anything past its own responseDeadline at read time
 * (no scheduler needed — see the audit): a pending request past its
 * deadline is transitioned to "expired" here and simply excluded from the
 * result, never surfaced as a live item to either party.
 */
export async function listPendingReconnectRequestsForMember(personId: string): Promise<PendingReconnectRequestView[]> {
  const [asInitiator, asRecipient] = await Promise.all([
    adminDb.collection("eventReconnectRequests").where("initiatorPersonId", "==", personId).where("status", "==", "pending").get(),
    adminDb.collection("eventReconnectRequests").where("recipientPersonId", "==", personId).where("status", "==", "pending").get(),
  ]);
  const docs = [...asInitiator.docs, ...asRecipient.docs];

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
    const otherProfileSnap = otherUid ? await adminDb.doc(`profiles/${otherUid}`).get() : null;
    const otherFirstName = (otherProfileSnap?.data()?.visible?.firstName as string | undefined) || "—";

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
  | { ok: false; error: "not_found" | "not_your_request" | "already_decided" | "expired" | "blocked" };

/**
 * Accept/decline — the recipient only (an initiator canceling their own
 * sent request is deliberately not built for V1, see the report: it isn't
 * needed for the product principle and a cancel path would need its own
 * careful thought about whether it refunds the allowance, which it must
 * NOT per the explicit product rule). On accept, creates a real
 * IntroductionDocument tagged source:"event" — from that point on this
 * pair is governed by the IDENTICAL Connexiones/contact-reveal pipeline as
 * an algorithmic introduction; nothing else about that pipeline changes.
 *
 * Re-checks blocked-pair state here (never checked at creation time for a
 * request that targeted a not-yet-activated recipient, since their person
 * id wasn't resolvable then) — the one point besides creation where it's
 * guaranteed both person ids are now known, right before an introduction
 * (and therefore eventual contact reveal) would otherwise be created.
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

    const blockCheck = await getPairHistoryDocument(data.initiatorPersonId, deciderPersonId);
    if (blockCheck?.state === "blocked") {
      tx.update(requestRef, { status: "declined", decidedAt: now });
      return { ok: false, error: "blocked" as const };
    }

    const event = await getEligibleEvent(data.eventId);
    const introductionRef = adminDb.doc(`introductions/${requestId}`);
    const introduction: IntroductionDocument = {
      personIdA: data.initiatorPersonId,
      personIdB: deciderPersonId,
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
