import { getAge, hasChildUnderAge } from "@/lib/introduction/age";
import type { ProfileDocument } from "@/lib/introduction/types";

/** A partner's children counting as "young" for the partnerHasYoungChildrenOk dealbreaker. */
const YOUNG_CHILD_AGE_THRESHOLD = 15;

/**
 * Reciprocal hard filters — a pair is only ever eligible if BOTH people's
 * dealbreakers accept the other. This is what "reciprocal hard-filter
 * rejection" means: A wanting to meet B is not enough if B's own
 * dealbreakers would reject A.
 *
 * When a dealbreaker is engaged (the recipient actually stated a
 * requirement) but the OTHER person's relevant self-report is unknown
 * (null — including "no lo sé" for future-children intent, a genuine but
 * inconclusive answer), the filter FAILS rather than passing. Unknown is
 * never treated as compatible — see README "Unknown handling". New
 * profiles are required to answer the fields this depends on
 * (`childrenBirthYears` when they have children, `wantsFutureChildren`),
 * so in practice this null case should only arise for a profile that
 * completed onboarding before these fields existed.
 */

function ageOf(profile: ProfileDocument): number | null {
  const bd = profile.private.birthDate;
  if (!bd) return null;
  return getAge(bd.toDate().toISOString().slice(0, 10));
}

function normalizedCity(city: string): string {
  return city.trim().toLowerCase();
}

// otherGender === null (unknown) -> false: an unstated gender can never
// satisfy a gendersSought requirement.
function acceptsGender(profile: ProfileDocument, otherGender: ProfileDocument["visible"]["gender"]): boolean {
  return otherGender !== null && profile.dealbreakers.gendersSought.includes(otherGender);
}

// otherAge === null (unknown, e.g. no birth date on record) -> false: an
// unknown age can never satisfy an age-range requirement.
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
  // "hasta_50km" is no longer offered as a UI option for exactly this
  // reason (see PreferencesSection.tsx) — kept in the type for future use.
  if (profile.dealbreakers.maxDistance !== "misma_ciudad") return true;
  // Two empty/unknown city strings would normalize-equal each other
  // (both ""), which would wrongly pass a "misma ciudad" requirement —
  // guard against that explicitly rather than relying on string equality.
  if (!profile.visible.city.trim() || !other.visible.city.trim()) return false;
  return normalizedCity(profile.visible.city) === normalizedCity(other.visible.city);
}

// other's relationshipIntention === null (unknown) -> false: never
// treated as an accepted intention.
function acceptsIntention(profile: ProfileDocument, other: ProfileDocument): boolean {
  const intention = other.visible.relationshipIntention;
  return (
    intention !== null &&
    profile.dealbreakers.relationshipIntentionsAccepted.includes(intention)
  );
}

// other's smoking === null (unknown) -> false: never treated as an
// accepted smoking level.
function acceptsSmoking(profile: ProfileDocument, other: ProfileDocument): boolean {
  const smoking = other.visible.smoking;
  return smoking !== null && profile.dealbreakers.smokingAccepted.includes(smoking);
}

// Explicit three-way handling — this is the one fail-open the audit
// found: the previous `if (other.hasChildren !== true) return true`
// treated `null` (unknown) the same as `false` (confirmed no children),
// silently letting unknown data satisfy a hard requirement. Now:
// `null` (unknown) always fails closed; `false` (confirmed no children)
// passes since the dealbreaker doesn't apply; `true` requires explicit
// partnerHasChildrenOk === true, as before.
function acceptsChildren(profile: ProfileDocument, other: ProfileDocument): boolean {
  if (other.visible.hasChildren === null) return false;
  if (other.visible.hasChildren === false) return true;
  return profile.dealbreakers.partnerHasChildrenOk === true;
}

// Same explicit three-way handling as acceptsChildren above — the
// original `if (other.hasChildren !== true) return true` had the
// identical fail-open bug (null silently treated as "no children, skip
// this check") caught here during the hardening pass, not just in
// acceptsChildren.
function acceptsYoungChildren(profile: ProfileDocument, other: ProfileDocument): boolean {
  if (other.visible.hasChildren === null) return false;
  if (other.visible.hasChildren === false) return true;
  const birthYears = other.visible.childrenBirthYears;
  if (!birthYears || birthYears.length === 0) return false; // unknown -> never treated as compatible
  const hasYoungChild = hasChildUnderAge(birthYears, YOUNG_CHILD_AGE_THRESHOLD);
  if (!hasYoungChild) return true; // no young children, so this dealbreaker doesn't bind
  return profile.dealbreakers.partnerHasYoungChildrenOk === true;
}

function acceptsFutureChildrenIntention(profile: ProfileDocument, other: ProfileDocument): boolean {
  const pref = profile.dealbreakers.partnerWantsFutureChildren;
  // "indiferente", or the recipient never stated a preference at all —
  // either way there's nothing to check against the other person's data.
  if (pref == null || pref === "indiferente") return true;
  const intention = other.visible.wantsFutureChildren;
  if (intention == null) return false; // unknown -> never treated as compatible
  if (intention === "no_lo_se") return false; // an explicit "I don't know" never satisfies a specific si/no requirement
  return intention === pref;
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
    acceptsChildren(a, b) &&
    acceptsYoungChildren(a, b) &&
    acceptsFutureChildrenIntention(a, b);

  const bAcceptsA =
    acceptsGender(b, a.visible.gender) &&
    acceptsAge(b, ageA) &&
    acceptsDistance(b, a) &&
    acceptsIntention(b, a) &&
    acceptsSmoking(b, a) &&
    acceptsChildren(b, a) &&
    acceptsYoungChildren(b, a) &&
    acceptsFutureChildrenIntention(b, a);

  return aAcceptsB && bAcceptsA;
}
