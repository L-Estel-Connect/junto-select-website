/**
 * Plain types for the public /colaboraciones brand-partnership form — same
 * convention as src/lib/types.ts's InvitationPayload. This is a one-off
 * business inquiry, never a newsletter/marketing signup: there is no
 * "aceptaComunicaciones" field here, deliberately, and the API route never
 * calls upsertBrevoContact.
 */
export type CollaborationType =
  | "partner_evento"
  | "producto_experiencia"
  | "a_medida"
  | "otra";

export interface CollaborationPayload {
  nombre: string;
  marca: string;
  email: string;
  instagramOWeb: string;
  tipoColaboracion: CollaborationType | "";
  mensaje: string;
  /**
   * Honeypot — visually hidden from real visitors (see CollaborationForm),
   * never read by them. Bots that blindly fill every form field populate
   * it; any non-empty value here marks the submission as spam server-side
   * without needing any new rate-limiting infrastructure.
   */
  website: string;
}

export const emptyCollaboration: CollaborationPayload = {
  nombre: "",
  marca: "",
  email: "",
  instagramOWeb: "",
  tipoColaboracion: "",
  mensaje: "",
  website: "",
};

export const collaborationTypeOptions: { value: CollaborationType; label: string }[] = [
  { value: "partner_evento", label: "Partner de un evento — 500 €" },
  { value: "producto_experiencia", label: "Producto / experiencia" },
  { value: "a_medida", label: "Colaboración a medida" },
  { value: "otra", label: "Otra propuesta" },
];
