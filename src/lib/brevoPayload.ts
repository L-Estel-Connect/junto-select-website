import type { InvitationPayload } from "./types";

export interface BrevoContactPayload {
  email: string;
  updateEnabled: true;
  attributes: Record<string, string>;
  listIds?: number[];
}

/**
 * Pure Brevo contact payload construction — no secrets, no network call,
 * deliberately kept in its own module (unlike brevo.ts, no `server-only`
 * marker) so it can be unit tested directly without a running server or a
 * real Brevo account.
 *
 * Attribute mapping — deliberately narrow (October 2026 operational-audit
 * pass): only attributes the account owner confirmed already exist are
 * sent. `GENERO` is an EXISTING Brevo attribute (confirmed values
 * "Mujer"/"Hombre", which is exactly what the homepage form already
 * produces — no new attribute created). `NOMBRE`, `PROFESION`, `TELEFONO`
 * are common, low-risk CRM fields sent on the same assumption but not yet
 * independently confirmed — verify these exist in Brevo (Contacts >
 * Settings > Contact attributes) with these exact internal names before
 * relying on them being populated.
 *
 * Consent/age-confirmation data (`confirmaEdad`, `aceptaComunicaciones`)
 * and the free-text bio (`sobreTi`) are deliberately NOT sent to Brevo —
 * they were never confirmed to be existing Brevo attributes, and pushing
 * unverified custom attributes risks either silent data loss (if Brevo
 * ignores unknown keys) or a rejected request (if it doesn't; behavior
 * not verified against a real account in this environment). The durable,
 * timestamped record of that consent lives in Firestore
 * (`invitationRequests/{id}`, written by the route before Brevo is even
 * called) — Brevo is a marketing-contact sync, not the consent system of
 * record.
 *
 * `email` is always the identity/deduplication key (`updateEnabled: true`
 * below) — a repeat submission from the same address updates the existing
 * Brevo contact rather than creating a duplicate. `listId` is taken as a
 * parameter (the caller reads it from `BREVO_LIST_ID`) rather than read
 * from `process.env` here, so this stays a pure, deterministic function.
 */
export function buildBrevoContactPayload(
  input: InvitationPayload,
  listId?: number,
): BrevoContactPayload {
  const attributes: Record<string, string> = {
    NOMBRE: input.nombre.trim(),
    GENERO: input.genero === "mujer" ? "Mujer" : "Hombre",
  };

  if (input.profesion.trim()) {
    attributes.PROFESION = input.profesion.trim();
  }
  if (input.telefono.trim()) {
    attributes.TELEFONO = input.telefono.trim();
  }

  return {
    email: input.email.trim(),
    updateEnabled: true,
    attributes,
    ...(listId ? { listIds: [listId] } : {}),
  };
}
