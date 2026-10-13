import type { CommunityPayload } from "./types";

export interface BrevoContactPayload {
  email: string;
  updateEnabled: true;
  attributes: Record<string, string>;
  listIds?: number[];
}

const CITY_LABEL: Record<string, string> = {
  madrid: "Madrid",
  valencia: "Valencia",
  barcelona: "Barcelona",
  malaga: "Málaga",
  otra: "Otra",
};

/**
 * Pure Brevo contact payload for a "Recibir invitaciones" registration —
 * no secrets, no network, so it can be checked without a Brevo account.
 *
 * Brevo setup confirmed by the account owner (13 Oct 2026): one list, the
 * existing list 12 (`BREVO_LIST_ID`), and cities as a contact attribute,
 * never as separate lists. Only attributes that exist in Brevo are sent:
 * `NOMBRE` and `GENERO` (existing; "Mujer"/"Hombre") and `CIUDAD` (text,
 * created for this form; "Madrid", "Valencia", "Barcelona", "Málaga" or
 * "Otra"). A new city needs a Brevo segment on CIUDAD, not code.
 *
 * Everything else the form collects (other city name, phone, company, age
 * range, interests, consent wording and version) stays in Firestore
 * (`invitationRequests`), the system of record.
 *
 * `email` is the dedup key (`updateEnabled: true`): an existing contact is
 * updated and added to list 12; its other lists, attributes and its
 * subscription status are left as they are (no `emailBlacklisted`).
 */
export function buildBrevoContactPayload(input: CommunityPayload, options: { listId?: number }): BrevoContactPayload {
  return {
    email: input.email.trim().toLowerCase(),
    updateEnabled: true,
    attributes: {
      NOMBRE: input.nombre.trim(),
      GENERO: input.genero === "mujer" ? "Mujer" : "Hombre",
      CIUDAD: CITY_LABEL[input.ciudad] ?? "Otra",
    },
    ...(options.listId ? { listIds: [options.listId] } : {}),
  };
}
