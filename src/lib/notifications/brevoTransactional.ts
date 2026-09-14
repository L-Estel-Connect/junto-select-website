import "server-only";

const BREVO_TRANSACTIONAL_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Deliberately a completely separate code path from `brevo.ts`'s
 * `upsertBrevoContact` (the public invitation form's `/v3/contacts`
 * integration): Brevo's transactional send API
 * (`/v3/smtp/email`) never touches a contact list, so a service email
 * queued here can never add or modify anyone on `BREVO_LIST_ID` or any
 * other marketing list. Same `BREVO_API_KEY` secret, different endpoint,
 * different purpose — operational/service email is not marketing
 * consent, and this module has no way to conflate the two even by
 * accident.
 */
export class BrevoSenderNotConfiguredError extends Error {}
export class BrevoTransactionalRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface SenderIdentity {
  email: string;
  name: string;
}

/**
 * The transactional sender identity is NOT the same thing as having
 * `BREVO_API_KEY` configured — Brevo requires the `sender` address on a
 * transactional send to be a verified sender/domain in the account, which
 * nobody has provided yet (see README "Transactional email delivery").
 * Reading this from two new, dedicated env vars rather than inventing a
 * plausible-looking address is deliberate: a wrong sender either bounces
 * every send or, worse, could get flagged by Brevo — this must be a real,
 * verified value the account owner sets, never a guess.
 */
export function getTransactionalSenderIdentity(): SenderIdentity {
  const email = process.env.BREVO_SENDER_EMAIL;
  const name = process.env.BREVO_SENDER_NAME;
  if (!email || !email.trim() || !name || !name.trim()) {
    throw new BrevoSenderNotConfiguredError(
      "BREVO_SENDER_EMAIL and BREVO_SENDER_NAME are not configured — a verified Brevo sender " +
        "identity is required before any transactional email can be sent. See README " +
        "\"Transactional email delivery\".",
    );
  }
  return { email: email.trim(), name: name.trim() };
}

export interface SendTransactionalEmailInput {
  to: { email: string };
  subject: string;
  textContent: string;
}

/**
 * One plain-text transactional send. No template ID is used — Brevo
 * supports sending with inline subject/content directly, which is the
 * smallest approach that needs no pre-created template (none exist yet).
 * Throws `BrevoSenderNotConfiguredError` (config problem, caller should
 * fail the whole batch, not mark individual emails "failed") or
 * `BrevoTransactionalRequestError` (this specific send failed — caller
 * should mark it retryable).
 */
export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput,
): Promise<{ messageId: string | null }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new BrevoSenderNotConfiguredError("BREVO_API_KEY is not configured");
  }
  const sender = getTransactionalSenderIdentity();

  const response = await fetch(BREVO_TRANSACTIONAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender,
      to: [input.to],
      subject: input.subject,
      textContent: input.textContent,
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { message?: string };
      detail = body.message ?? "";
    } catch {
      // response body wasn't JSON — ignore, we still have the status.
    }
    throw new BrevoTransactionalRequestError(detail || "Brevo transactional request failed", response.status);
  }

  const body = (await response.json().catch(() => null)) as { messageId?: string } | null;
  return { messageId: body?.messageId ?? null };
}
