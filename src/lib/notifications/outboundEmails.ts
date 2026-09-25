import "server-only";
import { adminDb } from "@/lib/firebase/admin";

/**
 * A generic, provider-agnostic queue of "something happened worth
 * emailing about" — NOT tied to Brevo specifically, so the sender can be
 * swapped without touching every call site that queues an entry. The
 * actual sending worker lives in `sendOutboundEmails.ts`; this file only
 * ever queues, and every call site wraps queueing so a queueing failure
 * never blocks the actual business action (a payment-failure sync, an
 * account deletion, a new proposal) it's attached to.
 */
export type OutboundEmailType =
  | "payment_failed"
  | "account_deleted"
  | "renewal_reminder"
  | "new_proposal"
  | "invitation_received"
  | "mutual_introduction"
  | "legacy_profile_activation"
  /** One-time, content-free — see src/lib/eventReconnect: "someone you met wants to reconnect, activate to see who." Capped at one per participant per event regardless of how many different people request them — see EventParticipantDocument.invitationEmailSentAt. */
  | "event_reconnect_invite";

export type OutboundEmailStatus = "pending" | "sending" | "sent" | "failed";

export interface OutboundEmailDocument {
  type: OutboundEmailType;
  status: OutboundEmailStatus;
  createdAt: unknown;
  /**
   * Set when the account will still exist at send time (e.g.
   * payment_failed, renewal_reminder, new_proposal) — the sender resolves
   * the address from Firebase Auth then, not eagerly here.
   */
  uid: string | null;
  /**
   * Set when the account may already be gone by send time (account
   * deletion) — captured inline BEFORE deletion, since there will be no
   * uid to resolve afterward.
   */
  email: string | null;
  data: Record<string, unknown>;
  /** How many send attempts have been made — never reset, even across a failure/retry. */
  attempts: number;
  attemptedAt: unknown | null;
  /** Set only once the send genuinely succeeded — never touched again after that. */
  sentAt: unknown | null;
  /** The most recent failure reason, if any — cleared on a later success. */
  lastError: string | null;
  /** Brevo's own message id for the successful send, if it returned one. */
  providerMessageId: string | null;
}

/**
 * `id`: pass a deterministic id for anything that could otherwise be
 * queued more than once for the same real-world event (e.g. a renewal
 * reminder re-computed on a later daily scan before it's been sent).
 * Queueing is idempotent by construction: if a document already exists
 * at that id, in ANY state, this is a no-op — specifically, re-queueing
 * an ALREADY-SENT reminder must never reset it back to "pending" (that
 * would send the same real-world notice again), and re-queueing an
 * already-pending or already-failed one has nothing useful to change
 * either. Omit `id` for a genuinely one-off event already covered by the
 * caller's own dedup (e.g. the Stripe webhook's `processedStripeEvents`
 * check).
 */
export async function queueOutboundEmail(
  entry: Omit<
    OutboundEmailDocument,
    "status" | "createdAt" | "attempts" | "attemptedAt" | "sentAt" | "lastError" | "providerMessageId"
  >,
  id?: string,
): Promise<void> {
  const ref = id ? adminDb.collection("outboundEmails").doc(id) : adminDb.collection("outboundEmails").doc();

  if (id) {
    const existing = await ref.get();
    if (existing.exists) return;
  }

  const data: OutboundEmailDocument = {
    ...entry,
    status: "pending",
    createdAt: new Date(),
    attempts: 0,
    attemptedAt: null,
    sentAt: null,
    lastError: null,
    providerMessageId: null,
  };
  await ref.set(data);
}
