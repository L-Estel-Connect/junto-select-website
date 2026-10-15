import data from "./municipios.json";

/**
 * Spanish municipalities, used to turn the free-text city people typed
 * ("¿En qué ciudad vives?") into a place with a province and coordinates,
 * so the matchmaking search can filter by city, province or distance
 * without asking anyone to answer a new question.
 *
 * Data: spanish-cities-info 2.4.2 (ISC licence, see
 * municipios.LICENSE.txt), the 8,132 municipalities verified against INE.
 * Coordinates are the centroid of each municipal area, so distances are
 * accurate to a few km (up to ~7 km off the town centre in very large
 * municipalities such as Cáceres or Murcia). That's enough for "same area"
 * decisions; it is not a routing distance.
 *
 * Pure and synchronous on purpose: hardFilters.ts calls it per pair. Server
 * code only (the table is ~350 KB) — the admin UI reaches it through
 * /api/admin/clients/places.
 */

export interface Place {
  /** INE municipality code, e.g. "28079" for Madrid. */
  ine: string;
  name: string;
  province: string;
  community: string;
  lat: number;
  lng: number;
}

export type CityResolutionVia = "exact" | "alias" | "hint" | "prefix" | "manual";

export type CityResolution =
  | { status: "resolved"; place: Place; via: CityResolutionVia }
  | { status: "ambiguous"; options: Place[] }
  | { status: "unknown"; options: Place[] }
  | { status: "empty" };

interface RawData {
  provinces: [string, string][];
  m: [string, string, number, number, number][];
}

const raw = data as unknown as RawData;

export const PLACES: Place[] = raw.m.map(([name, ine, lat, lng, p]) => ({
  ine,
  name,
  province: raw.provinces[p][0],
  community: raw.provinces[p][1],
  lat,
  lng,
}));

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

const BY_INE = new Map(PLACES.map((p) => [p.ine, p]));

export function getPlace(ine: string | null | undefined): Place | null {
  return ine ? BY_INE.get(ine) ?? null : null;
}

/** Lower case, no accents, punctuation as spaces, single spaces. */
export function normalizePlaceText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñç ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Castilian and everyday names for municipalities whose official INE name
 * differs, plus a few common short forms. Keys are normalized; values are
 * INE codes. Checked by scripts/local-test/matchmaking.test.mts.
 */
const MUNICIPALITY_ALIASES: Record<string, string> = {
  "alicante": "03014",
  "valencia": "46250",
  "castellon": "12040",
  "castellon de la plana": "12040",
  "elche": "03065",
  "la coruna": "15030",
  "coruna": "15030",
  "orense": "32054",
  "gerona": "17079",
  "lerida": "25120",
  "san sebastian": "20069",
  "donostia san sebastian": "20069",
  "vitoria": "01059",
  "gasteiz": "01059",
  "palma de mallorca": "07040",
  "las palmas": "35016",
  "santa cruz": "38038",
  "jerez": "11020",
  "el puerto": "11027",
  "puerto de santa maria": "11027",
  "pamplona iruna": "31201",
  "iruna": "31201",
  "bcn": "08019",
  "barna": "08019",
  "hospitalet": "08101",
  "l hospitalet": "08101",
  "sant cugat": "08205",
  "pozuelo": "28115",
  "las rozas": "28127",
  "rozas": "28127",
  "boadilla": "28022",
  "majadahonda": "28080",
  "torrejon": "28148",
  "rivas": "28123",
  "sanse": "28134",
  "san sebastian de los reyes": "28134",
  "el escorial": "28131",
  "san lorenzo de el escorial": "28131",
  "alcala": "28005",
  "la moraleja": "28006",
  "aravaca": "28079",
  "madrid capital": "28079",
};

/** Same idea for provinces, so "Villanueva (Badajoz)" or "Elche, Alicante" can narrow a name. */
const PROVINCE_ALIASES: Record<string, string> = {
  "alicante": "Alacant",
  "valencia": "València",
  "castellon": "Castelló",
  "alava": "Araba",
  "vizcaya": "Bizkaia",
  "guipuzcoa": "Gipuzkoa",
  "baleares": "Illes Balears",
  "islas baleares": "Illes Balears",
  "mallorca": "Illes Balears",
  "la coruna": "A Coruña",
  "coruna": "A Coruña",
  "orense": "Ourense",
  "gerona": "Girona",
  "lerida": "Lleida",
  "tenerife": "Santa Cruz de Tenerife",
  "gran canaria": "Las Palmas",
  "rioja": "La Rioja",
};

const PROVINCE_BY_KEY = new Map<string, string>();
for (const [province] of raw.provinces) PROVINCE_BY_KEY.set(normalizePlaceText(province), province);
for (const [key, province] of Object.entries(PROVINCE_ALIASES)) PROVINCE_BY_KEY.set(key, province);

const BY_KEY = new Map<string, Place[]>();
function addKey(key: string, place: Place) {
  const list = BY_KEY.get(key);
  if (!list) BY_KEY.set(key, [place]);
  else if (!list.includes(place)) list.push(place);
}
for (const place of PLACES) {
  const key = normalizePlaceText(place.name);
  addKey(key, place);
  // "Vitoria-Gasteiz" -> also "vitoria gasteiz" (already) and each half
  // is handled by aliases; "A Coruña"/"L'Hospitalet" style articles are
  // also reachable without them.
  const withoutArticle = key.replace(/^(a|o|as|os|la|las|el|los|l|els|les|es|sa|ses) /, "");
  if (withoutArticle !== key) addKey(withoutArticle, place);
}

/** Words people add around a city that are not part of its name. */
const NOISE = /\b(capital|ciudad de|ciudad|centro|provincia de|provincia|comunidad de|comunidad|espana|spain|zona|area|alrededores|cerca de|afueras de|afueras)\b/g;

function provinceFrom(text: string): string | null {
  const key = normalizePlaceText(text);
  return PROVINCE_BY_KEY.get(key) ?? null;
}

function lookupKey(key: string): Place[] {
  const alias = MUNICIPALITY_ALIASES[key];
  if (alias) {
    const place = BY_INE.get(alias);
    if (place) return [place];
  }
  return BY_KEY.get(key) ?? [];
}

export interface ResolveHints {
  /** The person said they live in or near Madrid (existing `marketAvailability` answer). */
  nearMadrid?: boolean;
}

function narrow(
  options: Place[],
  provinceHints: string[],
  hints: ResolveHints,
): { place: Place; via: CityResolutionVia } | null {
  if (options.length === 1) return null;
  for (const province of provinceHints) {
    const inProvince = options.filter((p) => p.province === province);
    if (inProvince.length === 1) return { place: inProvince[0], via: "hint" };
  }
  if (hints.nearMadrid) {
    const inMadrid = options.filter((p) => p.province === "Madrid");
    if (inMadrid.length === 1) return { place: inMadrid[0], via: "hint" };
  }
  return null;
}

/**
 * Best effort, never a guess between two real places: an exact name, a
 * known alias, or a unique prefix resolves; a name shared by several
 * municipalities ("Villanueva…", "Sada") comes back as `ambiguous` with the
 * options, for a person to pick once.
 */
export function resolveCity(text: string | null | undefined, hints: ResolveHints = {}): CityResolution {
  if (!text || !text.trim()) return { status: "empty" };

  // "Pozuelo de Alarcón, Madrid", "Villanueva (Badajoz)", "Madrid - Aravaca"
  const parts = text
    .split(/[,()/;]|\s-\s/)
    .map((p) => normalizePlaceText(p))
    .filter(Boolean);
  const whole = normalizePlaceText(text);
  const provinceHints = parts.map(provinceFrom).filter((p): p is string => p !== null);

  // A part that is only a province ("Badajoz" in "Villanueva (Badajoz)")
  // narrows the other parts; it is tried as a place itself only last.
  const provinceParts = new Set(parts.filter((p) => provinceFrom(p) !== null));
  const nameParts = parts.length > 1 ? parts.filter((p) => !provinceParts.has(p)) : parts;
  const strip = (c: string) => c.replace(NOISE, " ").replace(/\s+/g, " ").trim();
  const keys = unique([whole, ...nameParts, ...[whole, ...nameParts].map(strip)].filter(Boolean));
  const inHintedProvince = (options: Place[]) => {
    const hinted = options.filter((p) => provinceHints.includes(p.province));
    return hinted.length > 0 ? hinted : options;
  };

  for (const key of keys) {
    const options = lookupKey(key);
    if (options.length === 1) {
      return { status: "resolved", place: options[0], via: MUNICIPALITY_ALIASES[key] ? "alias" : "exact" };
    }
    if (options.length > 1) {
      const narrowed = narrow(options, provinceHints, hints);
      if (narrowed) return { status: "resolved", ...narrowed };
      return { status: "ambiguous", options: inHintedProvince(options) };
    }
  }

  // "Villanueva" alone: every municipality whose name starts with it.
  for (const key of keys) {
    if (key.length < 3) continue;
    const prefixed = PLACES.filter((p) => normalizePlaceText(p.name).startsWith(`${key} `));
    if (prefixed.length === 1) return { status: "resolved", place: prefixed[0], via: "prefix" };
    if (prefixed.length > 1) {
      const narrowed = narrow(prefixed, provinceHints, hints);
      if (narrowed) return { status: "resolved", ...narrowed };
      return { status: "ambiguous", options: inHintedProvince(prefixed).slice(0, 15) };
    }
  }

  // Only a province was written ("Cáceres" is also a municipality and
  // resolved above; this is "Vivo en Badajoz, provincia").
  for (const part of provinceParts) {
    const options = lookupKey(part);
    if (options.length === 1) return { status: "resolved", place: options[0], via: "exact" };
  }

  return { status: "unknown", options: searchPlaces(keys[keys.length - 1] ?? whole, 8) };
}

/** For pickers: names starting with, then containing, the query. Larger cities first is not possible (no population data), so exact matches lead. */
export function searchPlaces(query: string, limit = 12): Place[] {
  const key = normalizePlaceText(query);
  if (key.length < 2) return [];
  const exact: Place[] = [];
  const starts: Place[] = [];
  const contains: Place[] = [];
  const aliasHit = MUNICIPALITY_ALIASES[key] ? BY_INE.get(MUNICIPALITY_ALIASES[key]) : undefined;
  if (aliasHit) exact.push(aliasHit);
  for (const place of PLACES) {
    if (place === aliasHit) continue;
    const name = normalizePlaceText(place.name);
    if (name === key) exact.push(place);
    else if (name.startsWith(key)) starts.push(place);
    else if (name.includes(key)) contains.push(place);
  }
  starts.sort((a, b) => a.name.length - b.name.length);
  return [...exact, ...starts, ...contains].slice(0, limit);
}

/** Great-circle distance in km between two places' centroids. */
export function distanceKm(a: Pick<Place, "lat" | "lng">, b: Pick<Place, "lat" | "lng">): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const PROVINCES: { name: string; community: string }[] = raw.provinces.map(([name, community]) => ({
  name,
  community,
}));

/** "Misma ciudad" in anyone's preferences means within this distance (Lara, 15 Oct 2026). */
export const SAME_CITY_RADIUS_KM = 20;
