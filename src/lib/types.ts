export type Gender = "mujer" | "hombre";

/** Cities the club is building its community in. `otra` = any other city in Spain (free text in `ciudadOtra`). */
export const COMMUNITY_CITIES = ["madrid", "valencia", "barcelona", "malaga", "otra"] as const;
export type CommunityCity = (typeof COMMUNITY_CITIES)[number];

export const AGE_RANGES = ["35-44", "45-54", "55-64", "65+"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export const COMMUNITY_INTERESTS = ["eventos", "introducciones", "cenas", "novedades"] as const;
export type CommunityInterest = (typeof COMMUNITY_INTERESTS)[number];

/**
 * "Recibir invitaciones" — joining the Comunidad Junto Select invitation
 * list. Deliberately NOT an account and NOT a profile: no Firebase Auth
 * user is created, nothing is written to `profiles/`. Stored in
 * `invitationRequests/{id}` (same collection the previous invitation form
 * used, so there is one registration system, not two) and synced to Brevo.
 * The form exists to receive invitations, so its one required box is the
 * explicit consent to that purpose (COMMUNITY_CONSENT).
 */
export interface CommunityPayload {
  nombre: string;
  email: string;
  ciudad: CommunityCity | "";
  ciudadOtra: string;
  /** Optional. */
  telefono: string;
  /** Optional. */
  empresa: string;
  genero: Gender | "";
  rangoEdad: AgeRange | "";
  intereses: CommunityInterest[];
  /** Required: the box stating COMMUNITY_CONSENT.text. */
  aceptaInvitaciones: boolean;
  /** Where the registration started (e.g. "web_unete", "web_ciudad_valencia"). Sanitized server-side. */
  fuente: string;
}

/**
 * The exact consent wording shown next to the box, stored with every
 * registration (with its version) as proof of what the person agreed to.
 * Change the version whenever the text changes.
 */
export const COMMUNITY_CONSENT = {
  version: "invitaciones_v1",
  text: "Quiero recibir por email las invitaciones y novedades de Junto Select. He leído la política de privacidad.",
} as const;

export const emptyCommunity: CommunityPayload = {
  nombre: "",
  email: "",
  ciudad: "madrid",
  ciudadOtra: "",
  telefono: "",
  empresa: "",
  genero: "",
  rangoEdad: "",
  intereses: [],
  aceptaInvitaciones: false,
  fuente: "web_unete",
};
