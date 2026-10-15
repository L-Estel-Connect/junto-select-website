import type { CommunityCity } from "@/lib/types";

/**
 * Public navigation. The logo links to Inicio; no Ciudades. Membresía Select
 * is retired from the public journey (its pages, checkout and member area
 * still work by direct link) and the public Introducciones service is now
 * presented as Matchmaking; /introducciones redirects there (next.config.ts).
 */
export const NAV = [
  { href: "/eventos", label: "Encuentros" },
  { href: "/matchmaking", label: "Matchmaking" },
] as const;

/** The footer keeps El Club, which the header leaves to the homepage (Oct 2026). */
export const FOOTER_NAV = [{ href: "/club", label: "El Club" }, ...NAV] as const;

export const SIGN_IN_LABEL = "Acceder a mi perfil";

/** The paid matchmaking service and its consultation request. */
export const MATCHMAKING_HREF = "/matchmaking";
export const CONSULTATION_HREF = "/matchmaking#entrevista";

/**
 * The free private candidate pool ("red privada"). Until the candidate
 * portal is approved, joining reuses the existing private-profile journey
 * (passive Introducciones profile).
 */
export const PRIVATE_POOL_HREF = "/introduction?modalidad=pasivo";

/**
 * Lara's Calendly event for the ~20-minute qualification call (one event for
 * both programmes). While it is null, the programme buttons open the request
 * form on /matchmaking instead.
 */
export const CALENDLY_URL: string | null = null;

/**
 * The booking link for a programme. Calendly fills its first invitee
 * question ("Programa de interés") from `a1`, and keeps `utm_content` on the
 * booking, so the programme arrives with the appointment either way.
 */
export function calendlyHref(programme?: { key: string; name: string }): string | null {
  if (!CALENDLY_URL) return null;
  const url = new URL(CALENDLY_URL);
  if (programme) {
    url.searchParams.set("a1", programme.name);
    url.searchParams.set("utm_content", programme.key);
  }
  url.searchParams.set("utm_source", "junto-select-web");
  return url.toString();
}

/**
 * The Select event benefit, worded once for every public page. Kept here so
 * the homepage, Membresía, Introducciones and Encuentros never drift apart.
 */
export const EVENT_BENEFIT = {
  short: "20 % en un encuentro al mes",
  text: "Como miembro Select, recibes un código personal del 20 % para utilizar una sola vez por ciclo mensual en un encuentro Junto Select elegible.",
  conditions: "Un código por ciclo mensual, válido para un encuentro elegible. De un solo uso y no acumulable con otros descuentos.",
} as const;

/** The contact address already published in the legal pages. */
export const CONTACT_EMAIL = "juntoselect@gmail.com";
export const INSTAGRAM_URL = "https://www.instagram.com/juntoselect/";

/** Sign-in for existing accounts (introductions profiles and members). */
export const SIGN_IN_HREF = "/introduction";

/**
 * Social proof. Wording only claims what the data supports: 300+ are
 * cumulative participations (unique people not verified), 700+ are people
 * in the contact/community base (not accounts).
 */
export const FIGURES = [
  { value: "300+", label: "participaciones en nuestros encuentros" },
  { value: "700+", label: "personas en nuestra comunidad" },
  { value: "3.000+", label: "seguidores en Instagram" },
] as const;

export interface CityInfo {
  slug: CommunityCity;
  name: string;
  status: "activo" | "proximamente" | "otra";
  statusLabel: string;
}

export const CITIES: CityInfo[] = [
  { slug: "madrid", name: "Madrid", status: "activo", statusLabel: "Activo" },
  { slug: "valencia", name: "Valencia", status: "proximamente", statusLabel: "Próximamente" },
  { slug: "barcelona", name: "Barcelona", status: "proximamente", statusLabel: "Próximamente" },
  { slug: "malaga", name: "Málaga", status: "proximamente", statusLabel: "Próximamente" },
  { slug: "otra", name: "Otras ciudades", status: "otra", statusLabel: "En España" },
];

export function joinHref(city?: CommunityCity): string {
  return city ? `/unete?ciudad=${city}` : "/unete";
}
