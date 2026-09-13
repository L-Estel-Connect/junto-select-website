import { NextResponse } from "next/server";
import { isAuthorizedAdminRequest } from "@/lib/matching/adminAuth";
import { findUpcomingRenewalReminders } from "@/lib/billing/renewalReminders";
import { queueOutboundEmail } from "@/lib/notifications/outboundEmails";

export const runtime = "nodejs";

/**
 * Scheduler-facing entry point for renewal-reminder queueing — completely
 * independent of the matching scheduler (see README "Renewal reminders
 * vs. matching cycle"): this looks at Stripe renewal dates on the
 * existing `billing/{uid}` mirror, the matching scheduler looks at each
 * member's own matching anchor. Neither reads the other's state.
 *
 * Only QUEUES entries (`outboundEmails`, `type: "renewal_reminder"`) —
 * no email is actually sent, since that needs Brevo credentials/templates
 * this codebase doesn't have yet (see the operational audit). Idempotent:
 * each candidate's queue doc id is deterministic
 * (`renewal_{uid}_{periodEndDate}`), so calling this repeatedly before
 * the reminder is actually sent just re-writes the same pending entry
 * rather than piling up duplicates.
 */
export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const candidates = await findUpcomingRenewalReminders();

  for (const candidate of candidates) {
    const periodKey = candidate.currentPeriodEnd.toISOString().slice(0, 10);
    await queueOutboundEmail(
      {
        type: "renewal_reminder",
        uid: candidate.uid,
        email: null,
        data: {
          planKey: candidate.planKey,
          renewalDate: candidate.currentPeriodEnd.toISOString(),
        },
      },
      `renewal_${candidate.uid}_${periodKey}`,
    );
  }

  return NextResponse.json({ ok: true, queued: candidates.length });
}
