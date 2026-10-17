import type { ProfileDocument } from "@/lib/introduction/types";
import { getPlace, resolveCity, type CityResolution, type Place } from "./places";

/**
 * Where a profile is, derived from the city its owner typed — never stored
 * on the profile itself. A team-confirmed choice for an ambiguous name
 * (candidateLocations/{uid}, see clients/locations.ts) is attached to the
 * in-memory profile object with `attachConfirmedPlace` before matching, so
 * hardFilters.ts can stay a pure function of two profiles.
 */

const confirmed = new WeakMap<ProfileDocument, Place>();

export function attachConfirmedPlace(profile: ProfileDocument, place: Place | null): void {
  if (place) confirmed.set(profile, place);
  else confirmed.delete(profile);
}

function nearMadrid(profile: ProfileDocument): boolean {
  const a = profile.visible.marketAvailability;
  return a === "lives_in_market" || a === "lives_near_market";
}

// The same few dozen city strings are resolved for every pair in a search.
const cache = new Map<string, CityResolution>();

export function resolveProfileLocation(profile: ProfileDocument): CityResolution {
  const place = confirmed.get(profile);
  if (place) return { status: "resolved", place, via: "manual" };
  const near = nearMadrid(profile);
  const key = `${near ? 1 : 0}|${profile.visible.city}`;
  let result = cache.get(key);
  if (!result) {
    result = resolveCity(profile.visible.city, { nearMadrid: near });
    if (cache.size > 5000) cache.clear();
    cache.set(key, result);
  }
  return result;
}

export function placeOfProfile(profile: ProfileDocument): Place | null {
  const r = resolveProfileLocation(profile);
  return r.status === "resolved" ? r.place : null;
}

export { getPlace };
