import "server-only";
import type { CommunityPayload } from "./types";
import { buildBrevoContactPayload } from "./brevoPayload";

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
 * Overridable only so local testing can point at a stand-in server instead
 * of the real Brevo API (see README "Local testing"). Unset in production.
 */
function contactsUrl(): string {
  const base = process.env.BREVO_API_BASE_URL?.replace(/\/+$/, "") || "https://api.brevo.com/v3";
  return `${base}/contacts`;
}

/**
 * Syncs a Comunidad Junto Select registration to Brevo. The contact is
 * added to `BREVO_COMMUNITY_LIST_ID` — a NEW list, deliberately separate
 * from the historical `BREVO_LIST_ID` list, which this form no longer
 * writes to. Without `BREVO_COMMUNITY_LIST_ID` the contact is still
 * created/updated (with all attributes) but attached to no list.
 */
export async function upsertBrevoContact(input: CommunityPayload) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new BrevoConfigError("BREVO_API_KEY is not configured");
  }

  const listId = process.env.BREVO_COMMUNITY_LIST_ID
    ? Number(process.env.BREVO_COMMUNITY_LIST_ID)
    : undefined;

  const response = await fetch(contactsUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(
      buildBrevoContactPayload(input, {
        listId: Number.isFinite(listId) ? listId : undefined,
        today: new Date().toISOString().slice(0, 10),
      }),
    ),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { message?: string };
      detail = body.message ?? "";
    } catch {
      // Non-JSON error body — the status code alone is recorded.
    }
    throw new BrevoRequestError(detail || "Brevo request failed", response.status);
  }
}
