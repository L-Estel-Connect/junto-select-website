import "server-only";
import { adminDb } from "@/lib/firebase/admin";

/**
 * A generic, provider-agnostic queue of "something happened worth
 * emailing about" — NOT tied to Brevo specifically, so the eventual
 * sender can be swapped without touching every call site that queues an
 * entry. No consumer exists yet: sending requires Brevo credentials, a
 * sender identity, and templates the account owner hasn't provided (see
 * the October 2026 operational audit). Writing to this queue is always
 * safe and credential-free; every call site wraps it so a queueing
 * failure never blocks the actual business action (a payment-failure
 * sync, an account deletion) it's attached to.
 */
export type OutboundEmailType = "payment_failed" | "account_deleted" | "renewal_reminder";

export interface OutboundEmailDocument {
  type: OutboundEmailType;
  status: "pending";
  createdAt: unknown;
  /**
   * Set when the account will still exist at send time (e.g.
   * payment_failed, renewal_reminder) — the future sender resolves the
   * address from Firebase Auth then, not eagerly here.
   */
  uid: string | null;
  /**
   * Set when the account may already be gone by send time (account
   * deletion) — captured inline BEFORE deletion, since there will be no
   * uid to resolve afterward.
   */
  email: string | null;
  data: Record<string, unknown>;
}

/**
 * `id`: pass a deterministic id for anything that could otherwise be
 * queued more than once for the same real-world event (e.g. a renewal
 * reminder re-computed on a later scan before it's been sent) — this
 * makes queueing idempotent (upsert, `merge: true`) instead of piling up
 * duplicate queue entries. Omit it for a genuinely one-off event already
 * covered by the caller's own dedup (e.g. the Stripe webhook's
 * `processedStripeEvents` check).
 */
export async function queueOutboundEmail(
  entry: Omit<OutboundEmailDocument, "status" | "createdAt">,
  id?: string,
): Promise<void> {
  const data: OutboundEmailDocument = { ...entry, status: "pending", createdAt: new Date() };
  if (id) {
    await adminDb.collection("outboundEmails").doc(id).set(data, { merge: true });
  } else {
    await adminDb.collection("outboundEmails").add(data);
  }
}
