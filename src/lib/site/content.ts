import type { CommunityCity } from "@/lib/types";

export const NAV = [
  { href: "/club", label: "El Club" },
  { href: "/membresia", label: "Membresía Select" },
  { href: "/eventos", label: "Encuentros" },
  { href: "/#ciudades", label: "Ciudades" },
] as const;

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
