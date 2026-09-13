import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { BillingDocument, BillingStatus } from "./types";
import type { PlanKey } from "./plans";

/**
 * Courtesy renewal reminders are intentionally scoped to the 3- and
 * 6-month plans only — the standard 1-month plan renews every 4 weeks, so
 * a reminder cadence for it would be closer to a recurring notification
 * than a courtesy heads-up, and there is no legal requirement identified
 * for it (unlike the withdrawal-period disclosures already covered in
 * Términos §9). Revisit only if a specific legal/product reason emerges.
 */
export const RENEWAL_REMINDER_ELIGIBLE_PLANS: readonly PlanKey[] = ["three_month", "six_month"];

/**
 * 7 days before renewal: enough lead time for someone to act (cancel via
 * the Stripe Portal) before being charged, short enough that the renewal
 * date/amount named in the reminder is unambiguous and near-term rather
 * than a vague future event. Matches the plan owner's own instinct;
 * sending earlier risks being forgotten by the time the charge happens,
 * sending much later risks not leaving enough time to act.
 */
export const RENEWAL_REMINDER_WINDOW_DAYS = 7;

const ENTITLED_STATUSES_TO_SCAN: BillingStatus[] = ["active", "trialing", "past_due"];

export interface RenewalReminderCandidate {
  uid: string;
  planKey: "three_month" | "six_month";
  currentPeriodEnd: Date;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

/**
 * Pure, credential-free candidate computation — deliberately separate
 * from actually sending anything via Brevo (which needs an API key,
 * sender identity, and template the account owner hasn't provided yet;
 * see the operational audit report). Reads only the existing
 * `billing/{uid}` Firestore mirror, so it's safe to build, test, and even
 * run manually (e.g. from an admin view) before that infrastructure
 * exists — the eventual scheduled sender is just this function plus a
 * Brevo call per candidate.
 *
 * A subscription already `cancelAtPeriodEnd` is excluded: no renewal is
 * actually coming, so a "your membership will renew soon" reminder would
 * be actively misleading.
 */
export async function findUpcomingRenewalReminders(
  now: Date = new Date(),
  windowDays: number = RENEWAL_REMINDER_WINDOW_DAYS,
): Promise<RenewalReminderCandidate[]> {
  const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const snap = await adminDb
    .collection("billing")
    .where("status", "in", ENTITLED_STATUSES_TO_SCAN)
    .get();

  const candidates: RenewalReminderCandidate[] = [];
  for (const doc of snap.docs) {
    const billing = doc.data() as BillingDocument;
    if (billing.planKey !== "three_month" && billing.planKey !== "six_month") continue;
    if (billing.cancelAtPeriodEnd) continue;

    const periodEnd = toDate(billing.currentPeriodEnd);
    if (!periodEnd) continue;
    if (periodEnd < now || periodEnd > windowEnd) continue;

    candidates.push({ uid: doc.id, planKey: billing.planKey, currentPeriodEnd: periodEnd });
  }

  return candidates;
}
