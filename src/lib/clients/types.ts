import {
  emptyDealbreakers,
  emptyPreferences,
  type AboutMeVisible,
  type Dealbreakers,
  type IncomeRange,
  type Preferences,
} from "@/lib/introduction/types";
import { preferencesMissingFields, type PreferencesFieldName } from "@/lib/introduction/completion";

/**
 * Paying matchmaking clients (Programa Select, Select Privado), managed by
 * the team from /admin/clientes. Stored in `clients/{id}`, server-only
 * (default-deny in firestore.rules): a client never has to create an
 * account, and nothing here is readable from a browser.
 *
 * `profile` holds the client's answers in exactly the shape of a candidate
 * ProfileDocument's `visible` / `dealbreakers` / `preferences`, so the
 * existing hard filters and score compare a client with candidates
 * unchanged (see matchProfile.ts).
 */

export type Programme = "select" | "privado";

export const PROGRAMMES: Record<
  Programme,
  { label: string; priceEur: number; months: number; proposals: number; national: boolean; summary: string }
> = {
  select: {
    label: "Programa Select",
    priceEur: 1950,
    months: 6,
    proposals: 3,
    national: false,
    summary: "6 meses · búsqueda local en la red privada · hasta 3 propuestas",
  },
  privado: {
    label: "Select Privado",
    priceEur: 4800,
    months: 6,
    proposals: 6,
    national: true,
    summary: "6 meses · búsqueda en toda España · hasta 6 propuestas",
  },
};

export const CLIENT_STATUSES = [
  { value: "activo", label: "Activo" },
  { value: "en_pausa", label: "En pausa" },
  { value: "finalizado", label: "Finalizado" },
  { value: "cancelado", label: "Cancelado" },
] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number]["value"];

export const PAYMENT_STATUSES = [
  { value: "pendiente", label: "Pendiente" },
  { value: "pagado", label: "Pagado" },
  { value: "reembolsado", label: "Reembolsado" },
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]["value"];

export const PAYMENT_METHODS = [
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "bizum", label: "Bizum" },
  { value: "efectivo", label: "Efectivo" },
  { value: "otro", label: "Otro" },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export const CONTACT_CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "llamada", label: "Llamada" },
  { value: "email", label: "Email" },
] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number]["value"];

/** The candidate questionnaire's "about me" fields a client also answers (the client's name and city live at the top level). */
export type ClientVisible = Pick<
  AboutMeVisible,
  | "gender"
  | "profession"
  | "educationLevel"
  | "heightCm"
  | "languages"
  | "hasChildren"
  | "hasYoungChildren"
  | "wantsFutureChildren"
  | "relationshipIntention"
  | "smoking"
  | "drinking"
  | "activityLevel"
>;

export interface ClientProfileAnswers {
  visible: ClientVisible;
  incomeRange: IncomeRange | null;
  dealbreakers: Dealbreakers;
  preferences: Preferences;
}

export interface ClientPayment {
  status: PaymentStatus;
  amountEur: number | null;
  method: PaymentMethod | null;
  reference: string;
  /** YYYY-MM-DD */
  paidOn: string | null;
}

/** What the API returns and the admin page edits. Dates are YYYY-MM-DD strings, timestamps ISO strings. */
export interface ClientView {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  channel: ContactChannel | null;
  /** Age as told by the client, on `ageRecordedOn`; the search ages it forward. */
  ageYears: number | null;
  ageRecordedOn: string | null;
  city: string;
  /** INE code of the municipality chosen for `city`. */
  placeIne: string | null;
  programme: Programme | null;
  status: ClientStatus;
  programmeStart: string | null;
  programmeEnd: string | null;
  payment: ClientPayment;
  profile: ClientProfileAnswers;
  valuesInterests: string;
  dealbreakersNotes: string;
  notes: string;
  inquiryId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: string | null;
}

export function emptyClientProfile(): ClientProfileAnswers {
  return {
    visible: {
      gender: null,
      profession: "",
      educationLevel: null,
      heightCm: null,
      languages: [],
      hasChildren: null,
      hasYoungChildren: null,
      wantsFutureChildren: null,
      relationshipIntention: null,
      smoking: null,
      drinking: null,
      activityLevel: null,
    },
    incomeRange: null,
    dealbreakers: { ...emptyDealbreakers },
    preferences: { ...emptyPreferences },
  };
}

export function clientFullName(c: Pick<ClientView, "firstName" | "lastName">): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "Sin nombre";
}

/**
 * The answers the search needs before it can run, in the order the page
 * asks for them. Beyond name, age and city, these are exactly the answers
 * the existing hard filters read: an unanswered one rejects everybody
 * (they fail closed), so the search asks for it instead of showing an
 * empty list. "Lo que busca · imprescindible" reuses the candidates' own
 * completeness rule (preferencesMissingFields).
 */
export function missingForSearch(c: ClientView): string[] {
  const missing: string[] = [];
  const v = c.profile.visible;
  if (!c.firstName.trim()) missing.push("nombre");
  if (c.ageYears === null) missing.push("edad");
  if (!c.city.trim()) missing.push("ciudad");
  if (v.gender === null) missing.push("género");
  if (v.hasChildren === null || (v.hasChildren && v.hasYoungChildren === null)) missing.push("hijos");
  if (v.relationshipIntention === null) missing.push("qué tipo de relación busca");
  if (v.smoking === null) missing.push("si fuma");
  const labels: Record<PreferencesFieldName, string> = {
    gendersSought: "a quién busca",
    gendersSoughtAmbiguous: "a quién busca",
    ageMin: "edad buscada",
    ageMax: "edad buscada",
    ageRange: "edad buscada",
    maxDistance: "distancia",
    relationshipIntentionsAccepted: "tipo de relación que acepta",
    smokingAccepted: "si aceptaría a alguien que fuma",
    partnerYoungChildrenMatters: "si le importan hijos menores de 15",
  };
  for (const field of preferencesMissingFields(c.profile.dealbreakers)) {
    if (!missing.includes(labels[field])) missing.push(labels[field]);
  }
  return missing;
}

// --- Shortlist ------------------------------------------------------------

export const SHORTLIST_STATUSES = [
  { value: "preseleccionado", label: "Preseleccionado" },
  { value: "contactado", label: "Contactado" },
  { value: "interesado", label: "Interesado" },
  { value: "presentado", label: "Presentado" },
  { value: "rechazado", label: "Descartado" },
] as const;
export type ShortlistStatus = (typeof SHORTLIST_STATUSES)[number]["value"];

/** "Presentado" is an actual introduction and counts against the programme's limit. */
export const COUNTS_AS_PROPOSAL: ShortlistStatus[] = ["presentado"];

export interface ShortlistEntryView {
  id: string;
  clientId: string;
  personId: string | null;
  candidateUid: string | null;
  status: ShortlistStatus;
  note: string;
  scoreWhenAdded: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Live from the candidate's profile; null once the candidate deleted it. */
  candidate: {
    firstName: string;
    age: number | null;
    city: string;
    photoPath: string | null;
  } | null;
  /** The candidate deleted their profile after being introduced; kept only so the count stays right. */
  deletedCandidate: boolean;
}

export function isShortlistStatus(value: unknown): value is ShortlistStatus {
  return SHORTLIST_STATUSES.some((s) => s.value === value);
}
