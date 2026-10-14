/**
 * The private matchmaking application ("Solicitar una entrevista privada")
 * submitted from /matchmaking. Shared by the form, the public API route and
 * the admin list, so the three never disagree on fields, labels or rules.
 *
 * A prospective paying client, kept apart from Introducciones profiles and
 * from the community list: nothing here creates an account, a profile, a
 * Brevo contact or a payment.
 */

export const PROGRAMME_OPTIONS = [
  { value: "select", label: "Programa Select · 1.950 €" },
  { value: "privado", label: "Select Privado · 4.800 €" },
  { value: "nose", label: "Aún no lo sé" },
] as const;
export type InquiryProgramme = (typeof PROGRAMME_OPTIONS)[number]["value"];

export const OBJECTIVE_OPTIONS = [
  { value: "relacion_estable", label: "Una relación estable" },
  { value: "compromiso", label: "Un compromiso a largo plazo" },
  { value: "definiendo", label: "Aún lo estoy definiendo" },
] as const;
export type InquiryObjective = (typeof OBJECTIVE_OPTIONS)[number]["value"];

export const CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "llamada", label: "Llamada" },
  { value: "email", label: "Email" },
] as const;
export type InquiryChannel = (typeof CHANNEL_OPTIONS)[number]["value"];

/** Team pipeline for a request: simple on purpose, not a CRM. */
export const INQUIRY_STATUSES = [
  { value: "nueva", label: "Nueva" },
  { value: "contactada", label: "Contactada" },
  { value: "entrevista", label: "Entrevista agendada" },
  { value: "propuesta", label: "Propuesta enviada" },
  { value: "cliente", label: "Cliente" },
  { value: "espera", label: "Lista de espera" },
  { value: "descartada", label: "Descartada" },
] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number]["value"];

export const AGE_MIN = 25;
export const AGE_MAX = 90;

export interface InquiryPayload {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  canal: InquiryChannel | "";
  edad: string;
  ciudad: string;
  programa: InquiryProgramme | "";
  objetivo: InquiryObjective | "";
  edadDesde: string;
  edadHasta: string;
  busca: string;
  privacidad: boolean;
  /** Honeypot: never shown to people. */
  website: string;
}

export type InquiryErrors = Partial<Record<keyof InquiryPayload, string>>;

export const MAX_BUSCA_LENGTH = 600;

const isOneOf = <T extends string>(options: readonly { value: T }[], v: unknown): v is T =>
  typeof v === "string" && options.some((o) => o.value === v);

function age(v: string): number | null {
  if (!/^\d{2}$/.test(v.trim())) return null;
  const n = Number(v.trim());
  return n >= AGE_MIN && n <= AGE_MAX ? n : null;
}

export function validateInquiry(p: InquiryPayload): InquiryErrors {
  const e: InquiryErrors = {};
  if (!p.nombre.trim()) e.nombre = "Indícanos tu nombre.";
  if (!p.apellidos.trim()) e.apellidos = "Indícanos tus apellidos.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) e.email = "Indícanos un email válido.";
  if (p.telefono.replace(/\D/g, "").length < 9) e.telefono = "Indícanos un teléfono con al menos 9 cifras.";
  if (!isOneOf(CHANNEL_OPTIONS, p.canal)) e.canal = "Elige cómo prefieres que te contactemos.";
  if (age(p.edad) === null) e.edad = `Indica tu edad (entre ${AGE_MIN} y ${AGE_MAX}).`;
  if (!p.ciudad.trim()) e.ciudad = "Indícanos tu ciudad.";
  if (!isOneOf(PROGRAMME_OPTIONS, p.programa)) e.programa = "Elige un programa o «Aún no lo sé».";
  if (!isOneOf(OBJECTIVE_OPTIONS, p.objetivo)) e.objetivo = "Elige qué buscas.";
  const from = age(p.edadDesde);
  const to = age(p.edadHasta);
  if (from === null || to === null) e.edadDesde = "Indica el rango de edad que buscas.";
  else if (from > to) e.edadDesde = "La edad mínima no puede ser mayor que la máxima.";
  if (p.busca.length > MAX_BUSCA_LENGTH) e.busca = `Máximo ${MAX_BUSCA_LENGTH} caracteres.`;
  if (!p.privacidad) e.privacidad = "Necesitamos tu conformidad para gestionar la solicitud.";
  return e;
}

/** Normalizes any JSON body into a payload; unknown values become empty and fail validation. */
export function toInquiryPayload(body: unknown): InquiryPayload {
  const s = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 2000) : "");
  return {
    nombre: str(s.nombre),
    apellidos: str(s.apellidos),
    email: str(s.email),
    telefono: str(s.telefono),
    canal: isOneOf(CHANNEL_OPTIONS, s.canal) ? s.canal : "",
    edad: str(s.edad),
    ciudad: str(s.ciudad),
    programa: isOneOf(PROGRAMME_OPTIONS, s.programa) ? s.programa : "",
    objetivo: isOneOf(OBJECTIVE_OPTIONS, s.objetivo) ? s.objetivo : "",
    edadDesde: str(s.edadDesde),
    edadHasta: str(s.edadHasta),
    busca: str(s.busca),
    privacidad: s.privacidad === true,
    website: str(s.website),
  };
}

export function labelOf(options: readonly { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export function isInquiryStatus(v: unknown): v is InquiryStatus {
  return isOneOf(INQUIRY_STATUSES, v);
}
