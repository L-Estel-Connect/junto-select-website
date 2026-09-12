import "server-only";
import type { InvitationPayload } from "./types";

const BREVO_CONTACTS_URL = "https://api.brevo.com/v3/contacts";

export class BrevoConfigError extends Error {}

export class BrevoRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Sends an invitation request to Brevo as a contact.
 *
 * IMPORTANT — placeholder configuration:
 * The attribute keys below (NOMBRE, GENERO, PROFESION, TELEFONO,
 * EDAD_35_MAS, SOBRE_TI, CONSENTIMIENTO_COMUNICACIONES,
 * CONSENTIMIENTO_FECHA) are placeholders. They must exist as Contact
 * Attributes in the Brevo account (Contacts > Settings > Contact
 * attributes) with matching internal names and compatible types before
 * submissions will be accepted — Brevo rejects attributes it doesn't
 * recognize. See README.md "Brevo configuration required" for the full
 * list and recommended types. BREVO_LIST_ID is optional; when unset the
 * contact is still created/updated in Brevo, just not attached to a list.
 */
export async function upsertBrevoContact(input: InvitationPayload) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new BrevoConfigError("BREVO_API_KEY is not configured");
  }

  const listId = process.env.BREVO_LIST_ID
    ? Number(process.env.BREVO_LIST_ID)
    : undefined;

  const attributes: Record<string, string | boolean> = {
    NOMBRE: input.nombre.trim(),
    GENERO: input.genero === "mujer" ? "Mujer" : "Hombre",
    EDAD_35_MAS: input.confirmaEdad,
    CONSENTIMIENTO_COMUNICACIONES: input.aceptaComunicaciones,
    CONSENTIMIENTO_FECHA: new Date().toISOString(),
  };

  if (input.profesion.trim()) {
    attributes.PROFESION = input.profesion.trim();
  }
  if (input.telefono.trim()) {
    attributes.TELEFONO = input.telefono.trim();
  }
  if (input.sobreTi.trim()) {
    attributes.SOBRE_TI = input.sobreTi.trim();
  }

  const response = await fetch(BREVO_CONTACTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      email: input.email.trim(),
      updateEnabled: true,
      attributes,
      ...(listId ? { listIds: [listId] } : {}),
    }),
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
