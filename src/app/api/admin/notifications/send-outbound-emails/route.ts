import { NextResponse } from "next/server";
import { isAuthorizedAdminRequest } from "@/lib/matching/adminAuth";
import { sendPendingOutboundEmails } from "@/lib/notifications/sendOutboundEmails";
import { BrevoSenderNotConfiguredError } from "@/lib/notifications/brevoTransactional";

function isConfigurationError(error: unknown): boolean {
  return error instanceof BrevoSenderNotConfiguredError || (error instanceof Error && error.message.includes("APP_BASE_URL"));
}

export const runtime = "nodejs";

/**
 * The scheduler-facing entry point for actually sending queued
 * transactional emails (payment_failed, renewal_reminder,
 * account_deleted, new_proposal, invitation_received,
 * mutual_introduction) — see sendOutboundEmails.ts for the full
 * claim/send/idempotency design. Authenticated the same way every other
 * /api/admin/matching/* scheduler route is (MATCHING_ADMIN_SECRET); safe
 * to call as often as you like, since sending is idempotent per queued
 * document.
 *
 * Returns 503 (not 500) when the Brevo sender identity or APP_BASE_URL
 * isn't configured — this is a configuration gap, not a runtime crash,
 * and no queue document is touched when it happens.
 */
export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendPendingOutboundEmails();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (isConfigurationError(error)) {
      return NextResponse.json({ ok: false, error: "email_sender_not_configured" }, { status: 503 });
    }
    console.error("send-outbound-emails: failed", error);
    return NextResponse.json({ ok: false, error: "send_failed" }, { status: 500 });
  }
}
