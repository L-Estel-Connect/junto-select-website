import "server-only";
import type { InvitationPayload } from "./types";
import { buildBrevoContactPayload } from "./brevoPayload";

const BREVO_CONTACTS_URL = "https://api.brevo.com/v3/contacts";

export class BrevoConfigError extends Error {}

export class BrevoRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export { buildBrevoContactPayload } from "./brevoPayload";
export type { BrevoContactPayload } from "./brevoPayload";

/**
 * Sends an invitation request to Brevo as a contact — see
 * `brevoPayload.ts` for the attribute-mapping rationale (why only
 * NOMBRE/GENERO/PROFESION/TELEFONO are sent, and why consent/age/bio data
 * deliberately isn't). `BREVO_LIST_ID` is required to attach the contact
 * to your existing list; without it the contact is still created/updated
 * in Brevo, just not attached to any list — see README "Brevo
 * configuration required".
 */
export async function upsertBrevoContact(input: InvitationPayload) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new BrevoConfigError("BREVO_API_KEY is not configured");
  }

  const listId = process.env.BREVO_LIST_ID
    ? Number(process.env.BREVO_LIST_ID)
    : undefined;

  const response = await fetch(BREVO_CONTACTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(buildBrevoContactPayload(input, listId)),
  });

  if (!response.ok) {
    // Brevo returns 204 on a plain update; anything else in the 2xx range
    // we already accept above. From here down is a genuine failure.
    let detail = "";
    try {
      const body = (await response.json()) as { message?: string };
      detail = body.message ?? "";
    } catch {
      // response body wasn't JSON — ignore, we still have the status.
    }
    throw new BrevoRequestError(
      detail || "Brevo request failed",
      response.status,
    );
  }
}
