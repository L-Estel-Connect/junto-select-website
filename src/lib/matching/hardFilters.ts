import { getAge } from "@/lib/introduction/age";
import type { ProfileDocument } from "@/lib/introduction/types";

/**
 * Reciprocal hard filters — a pair is only ever eligible if BOTH people's
 * dealbreakers accept the other. This is what "reciprocal hard-filter
 * rejection" means: A wanting to meet B is not enough if B's own
 * dealbreakers would reject A.
 *
 * Two of the product's existing dealbreaker questions
 * (`partnerHasYoungChildrenOk`, `partnerWantsFutureChildren`) ask about
 * information the *other* person's profile does not actually collect
 * (there is no "are your children under 15" or "do you want children in
 * the future" field on AboutMeVisible) — enforcing them would mean
 * guessing at data that was never provided. They are intentionally NOT
 * enforced here; see README for this known gap and what schema addition
 * would close it.
 */

function ageOf(profile: ProfileDocument): number | null {
  const bd = profile.private.birthDate;
  if (!bd) return null;
  return getAge(bd.toDate().toISOString().slice(0, 10));
}

function normalizedCity(city: string): string {
  return city.trim().toLowerCase();
}

function acceptsGender(profile: ProfileDocument, otherGender: ProfileDocument["visible"]["gender"]): boolean {
  return otherGender !== null && profile.dealbreakers.gendersSought.includes(otherGender);
}

function acceptsAge(profile: ProfileDocument, otherAge: number | null): boolean {
  if (otherAge === null) return false;
  const { ageMin, ageMax } = profile.dealbreakers;
  if (ageMin !== null && otherAge < ageMin) return false;
  if (ageMax !== null && otherAge > ageMax) return false;
  return true;
}

function acceptsDistance(profile: ProfileDocument, other: ProfileDocument): boolean {
  // No geocoding infra exists yet (no lat/lng on a profile) — "misma
  // ciudad" is enforced as an exact normalized-city match; "hasta_50km"
  // and "sin_limite" both pass regardless of city until real distance
  // data exists. Documented limitation, not a silent approximation.
  if (profile.dealbreakers.maxDistance !== "misma_ciudad") return true;
  return normalizedCity(profile.visible.city) === normalizedCity(other.visible.city);
}

function acceptsIntention(profile: ProfileDocument, other: ProfileDocument): boolean {
  const intention = other.visible.relationshipIntention;
  return (
    intention !== null &&
    profile.dealbreakers.relationshipIntentionsAccepted.includes(intention)
  );
}

function acceptsSmoking(profile: ProfileDocument, other: ProfileDocument): boolean {
  const smoking = other.visible.smoking;
  return smoking !== null && profile.dealbreakers.smokingAccepted.includes(smoking);
}

function acceptsChildren(profile: ProfileDocument, other: ProfileDocument): boolean {
  if (other.visible.hasChildren !== true) return true;
  return profile.dealbreakers.partnerHasChildrenOk === true;
}

/** True only if BOTH profiles' dealbreakers would accept the other. */
export function passesHardFilters(a: ProfileDocument, b: ProfileDocument): boolean {
  const ageA = ageOf(a);
  const ageB = ageOf(b);

  const aAcceptsB =
    acceptsGender(a, b.visible.gender) &&
    acceptsAge(a, ageB) &&
    acceptsDistance(a, b) &&
    acceptsIntention(a, b) &&
    acceptsSmoking(a, b) &&
    acceptsChildren(a, b);

  const bAcceptsA =
    acceptsGender(b, a.visible.gender) &&
    acceptsAge(b, ageA) &&
    acceptsDistance(b, a) &&
    acceptsIntention(b, a) &&
    acceptsSmoking(b, a) &&
    acceptsChildren(b, a);

  return aAcceptsB && bAcceptsA;
}
