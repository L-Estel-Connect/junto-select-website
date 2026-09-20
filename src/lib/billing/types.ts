import type { PlanKey } from "./plans";

/**
 * Mirrors a subset of Stripe subscription statuses — Stripe remains the
 * source of truth; this is only a read-optimized cache written exclusively
 * by the webhook (server-side, Admin SDK). `"none"` is the default for
 * anyone who has never started a checkout.
 */
export type BillingStatus =
  | "none"
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid";

export interface TermsAcceptance {
  version: string;
  /** Separate from `version` (Terms) since the two documents can change independently. */
  privacyVersion: string;
  planKey: PlanKey;
  acceptedAt: unknown; // Firestore Timestamp
  /**
   * The member's express request (RDL 1/2007 art. 71/103) that the paid
   * search service begin immediately, before the 14-day statutory
   * withdrawal period ends — captured as its own explicit checkbox at
   * checkout, distinct from ordinary Terms acceptance. Always `true` when
   * present (the checkout route requires it before creating a session);
   * this field exists so the record has a timestamped, versioned trace of
   * that specific consent, not just of accepting the Terms in general.
   */
  immediateServiceRequested: boolean;
}

/**
 * `billing/{uid}` — a Firestore document, separate from `profiles/{uid}`
 * on purpose: `firestore.rules` makes it owner-readable but NEVER
 * client-writable (write: if false, same pattern as `proposals`/
 * `invitations`), so no field here can ever be forged by a signed-in
 * user's own client, unlike `profiles/{uid}` which the owner can update
 * directly. Every field is written only by the webhook or the
 * checkout/portal-session server routes, all using the Admin SDK.
 */
export interface BillingDocument {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: BillingStatus;
  planKey: PlanKey | null;
  /** Stripe's `current_period_end`, i.e. next renewal/expiry instant. */
  currentPeriodEnd: unknown | null; // Firestore Timestamp
  cancelAtPeriodEnd: boolean;
  canceledAt: unknown | null; // Firestore Timestamp
  /** Set on the most recent invoice.payment_failed for this subscription; cleared on success. */
  lastPaymentFailedAt: unknown | null; // Firestore Timestamp
  termsAcceptance: TermsAcceptance | null;
  createdAt: unknown; // Firestore Timestamp
  updatedAt: unknown; // Firestore Timestamp

  // --- Event benefit (Ticket Tailor monthly discount) anchor — see
  // src/lib/eventBenefits/lifecycle.ts. Deliberately its OWN anchor
  // fields, separate from profiles/{uid}.meta's matching anchor
  // (matchingAnchorAt/matchingPeriodsProcessed/nextMatchingDueAt): the
  // event benefit's monthly cadence must never be coupled to matching's.
  // Seeded by the same "first time we see this subscription id" check in
  // the webhook's syncSubscription, reset on a genuine resubscription. ---
  /** The subscription's own `start_date` — period 0's due date IS this anchor. */
  eventBenefitAnchorAt: unknown | null; // Firestore Timestamp
  /** Which subscription this anchor belongs to — a new id means a resubscription, and resets the whole event-benefit lifecycle from period 0. */
  eventBenefitSubscriptionId: string | null;
  /** Count of monthly benefits granted so far for this subscription. */
  eventBenefitPeriodsIssued: number;
  /** When the next monthly benefit is due; advanced by runDueEventBenefitScan; set to null once entitlement lapses. */
  nextEventBenefitDueAt: unknown | null; // Firestore Timestamp
}

export const emptyBillingDocument: BillingDocument = {
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  status: "none",
  planKey: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  canceledAt: null,
  lastPaymentFailedAt: null,
  termsAcceptance: null,
  createdAt: null,
  updatedAt: null,
  eventBenefitAnchorAt: null,
  eventBenefitSubscriptionId: null,
  eventBenefitPeriodsIssued: 0,
  nextEventBenefitDueAt: null,
};

/** Statuses that count as "billing entitlement currently valid." */
export function isEntitledStatus(status: BillingStatus): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}
