import type { CommunityPayload } from "./types";

export interface BrevoContactPayload {
  email: string;
  updateEnabled: true;
  attributes: Record<string, string | boolean>;
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
 * Pure Brevo contact payload for a Comunidad Junto Select registration —
 * no secrets, no network, so it can be checked without a Brevo account.
 *
 * Attribute names are the ones listed in the readiness report and must be
 * created in Brevo (Contacts > Settings > Contact attributes) BEFORE this
 * runs against a real account; this code never creates attributes. Only
 * `GENERO` already exists (category "Mujer"/"Hombre"). The new ones are
 * deliberately text/boolean/date types so no category-option ids are
 * involved, and each one maps 1:1 to a Brevo segment condition:
 *   CIUDAD, CIUDAD_OTRA, RANGO_EDAD, FUENTE (text) ·
 *   INT_EVENTOS, INT_INTRODUCCIONES, INT_CENAS, INT_NOVEDADES,
 *   CONSENT_MARKETING (boolean) ·
 *   CONSENT_MARKETING_FECHA, FECHA_REGISTRO_COMUNIDAD (date, YYYY-MM-DD).
 *
 * Only called for registrations WITH marketing consent (see the route), so
 * CONSENT_MARKETING is always true here; it is still sent explicitly so a
 * segment never has to infer consent from list membership.
 *
 * `email` is the dedup key (`updateEnabled: true`): an existing contact is
 * updated and added to the community list; Brevo keeps its other lists.
 */
export function buildBrevoContactPayload(
  input: CommunityPayload,
  options: { listId?: number; today: string },
): BrevoContactPayload {
  const has = (i: CommunityPayload["intereses"][number]) => input.intereses.includes(i);
  const attributes: Record<string, string | boolean> = {
    NOMBRE: input.nombre.trim(),
    GENERO: input.genero === "mujer" ? "Mujer" : "Hombre",
    CIUDAD: CITY_LABEL[input.ciudad] ?? "Otra",
    RANGO_EDAD: input.rangoEdad,
    INT_EVENTOS: has("eventos"),
    INT_INTRODUCCIONES: has("introducciones"),
    INT_CENAS: has("cenas"),
    INT_NOVEDADES: has("novedades"),
    FUENTE: input.fuente,
    CONSENT_MARKETING: true,
    CONSENT_MARKETING_FECHA: options.today,
    FECHA_REGISTRO_COMUNIDAD: options.today,
  };
  if (input.ciudad === "otra" && input.ciudadOtra.trim()) {
    attributes.CIUDAD_OTRA = input.ciudadOtra.trim();
  }

  return {
    email: input.email.trim().toLowerCase(),
    updateEnabled: true,
    attributes,
    ...(options.listId ? { listIds: [options.listId] } : {}),
  };
}
