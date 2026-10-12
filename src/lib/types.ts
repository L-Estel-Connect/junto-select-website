export type Gender = "mujer" | "hombre";

/** Cities the club is building its community in. `otra` = any other city in Spain (free text in `ciudadOtra`). */
export const COMMUNITY_CITIES = ["madrid", "valencia", "barcelona", "malaga", "otra"] as const;
export type CommunityCity = (typeof COMMUNITY_CITIES)[number];

export const AGE_RANGES = ["35-44", "45-54", "55-64", "65+"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export const COMMUNITY_INTERESTS = ["eventos", "introducciones", "cenas", "novedades"] as const;
export type CommunityInterest = (typeof COMMUNITY_INTERESTS)[number];

/**
 * The "Únete al club" registration — joining the Comunidad Junto Select.
 * Deliberately NOT an account and NOT a profile: no Firebase Auth user is
 * created, nothing is written to `profiles/`. Stored in
 * `invitationRequests/{id}` (same collection the previous invitation form
 * used, so there is one registration system, not two) and synced to Brevo
 * only when `aceptaMarketing` is true.
 */
export interface CommunityPayload {
  nombre: string;
  email: string;
  ciudad: CommunityCity | "";
  ciudadOtra: string;
  genero: Gender | "";
  rangoEdad: AgeRange | "";
  intereses: CommunityInterest[];
  /** Required: has read the privacy policy. */
  aceptaPrivacidad: boolean;
  /** Optional, separate: agrees to receive invitations and club news by email. */
  aceptaMarketing: boolean;
  /** Where the registration started (e.g. "web_unete", "web_ciudad_valencia"). Sanitized server-side. */
  fuente: string;
}

export const emptyCommunity: CommunityPayload = {
  nombre: "",
  email: "",
  ciudad: "",
  ciudadOtra: "",
  genero: "",
  rangoEdad: "",
  intereses: [],
  aceptaPrivacidad: false,
  aceptaMarketing: false,
  fuente: "web_unete",
};
