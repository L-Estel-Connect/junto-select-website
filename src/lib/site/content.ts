import type { CommunityCity } from "@/lib/types";

/** Approved navigation (v5, Option 1). The logo links to Inicio; no Ciudades. */
export const NAV = [
  { href: "/club", label: "El Club" },
  { href: "/eventos", label: "Encuentros" },
  { href: "/introducciones", label: "Introducciones" },
  { href: "/membresia", label: "Membresía Select" },
] as const;

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
