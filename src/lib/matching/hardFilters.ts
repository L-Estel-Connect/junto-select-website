import { getAge } from "@/lib/introduction/age";
import type { ProfileDocument } from "@/lib/introduction/types";
import type { HardFilterFailureReason } from "./types";

/**
 * Reciprocal hard filters — a pair is only ever eligible if BOTH people's
 * dealbreakers accept the other. This is what "reciprocal hard-filter
 * rejection" means: A wanting to meet B is not enough if B's own
 * dealbreakers would reject A.
 *
 * When a dealbreaker is engaged (the recipient actually stated a
 * requirement) but the OTHER person's relevant self-report is unknown
 * (null), the filter FAILS rather than passing. Unknown is never treated
 * as compatible — see README "Unknown handling". New profiles are
 * required to answer the field this depends on (`hasYoungChildren`, via
 * the single onboarding "¿Tienes hijos?" question), so in practice this
 * null case should only arise for a profile that completed onboarding
 * before that field existed and whose legacy data couldn't be derived
 * (see types.ts's `deriveLegacyHasYoungChildren`).
 *
 * Future-children compatibility is NOT a hard filter here anymore — it
 * moved to a mutual self-report SCORING signal (see scoring.ts's
 * `futureChildrenAlignment`), since a hard reject on "not aligned on
 * wanting more kids" was judged too strict a dealbreaker for this
 * audience. `Dealbreakers.partnerWantsFutureChildren` is legacy-only now.
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
// satisfy a gendersSought requirement. `gendersSought` is stored as an
// array for backward compatibility with an earlier multi-select UI, but
// Junto Select V1 requires EXACTLY one desired partner gender — zero
// (never answered) or more than one (a legacy multi-select answer, or a
// write that bypassed the current single-select UI) is never a valid,
// actionable preference, so both fail closed here exactly like every
// other unknown/invalid dealbreaker in this file. In practice such a
// profile is already excluded from the matching pool before reaching
// this check at all (see completion.ts preferencesMissingFields'
// gendersSoughtAmbiguous), but decision-time revalidation
// (pairHistory.ts) calls this directly against a freshly reloaded
// profile, so it must never rely on that pool exclusion alone.
function acceptsGender(profile: ProfileDocument, otherGender: ProfileDocument["visible"]["gender"]): boolean {
  if (profile.dealbreakers.gendersSought.length !== 1) return false;
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

// smokingAccepted is ordinal, not a flat allowlist: the three FrequencyLevel
// values form a scale (no < socialmente < habitualmente) from most to least
// conservative, and picking a tier is understood as "I'm fine with this or
// anything more conservative" — e.g. someone who accepts "socialmente" is
// necessarily fine with a partner who doesn't smoke at all ("no"). Without
// this, a person who selects "socialmente" only (the natural choice for
// "I'm okay with occasional smoking") would reciprocally reject a
// non-smoking partner, which is never the intended requirement. An empty
// smokingAccepted (no tier ever selected) still fails closed, same as before.
const SMOKING_FREQUENCY_RANK: Record<NonNullable<ProfileDocument["visible"]["smoking"]>, number> = {
  no: 0,
  socialmente: 1,
  habitualmente: 2,
};

// other's smoking === null (unknown) -> false: never treated as an
// accepted smoking level.
function acceptsSmoking(profile: ProfileDocument, other: ProfileDocument): boolean {
  const smoking = other.visible.smoking;
  if (smoking === null) return false;
  const accepted = profile.dealbreakers.smokingAccepted;
  if (accepted.length === 0) return false;
  const maxAcceptedRank = Math.max(...accepted.map((level) => SMOKING_FREQUENCY_RANK[level]));
  return SMOKING_FREQUENCY_RANK[smoking] <= maxAcceptedRank;
}

// The ONLY children-related hard filter (see types.ts
// `partnerYoungChildrenMatters`'s doc comment for the product history —
// there is deliberately no general "accepts a partner with any children"
// question or dealbreaker anymore; a candidate whose children are all
// 15+ always passes this check).
//
// Reads `hasYoungChildren` directly — asked as its own onboarding
// question now, never derived from birth years at filter time (see
// types.ts's `deriveLegacyHasYoungChildren` for the ONE place legacy data
// still gets converted, on read). `null` (unknown) always fails closed;
// `false` (no young children, whether or not there are older ones) passes
// since the dealbreaker can never bind; `true` requires the recipient's
// own stated requirement: `true` ("Sí, me importaría") hard-excludes;
// `false` ("No, no me importaría") never does; `null` (never answered)
// fails closed, the same "unknown dealbreaker" convention used everywhere
// else here.
function acceptsYoungChildren(profile: ProfileDocument, other: ProfileDocument): boolean {
  if (other.visible.hasYoungChildren === null) return false;
  if (other.visible.hasYoungChildren === false) return true;
  return profile.dealbreakers.partnerYoungChildrenMatters === false;
}

/**
 * Fixed check order, shared by both reciprocal directions — this is what
 * makes `evaluateHardFilters`'s "first failing reason" a stable, meaningful
 * attribution rather than an arbitrary one, and is the single source of
 * truth both `passesHardFilters` and the diagnostics in engine.ts rely on.
 */
const CHECKS: Array<{
  reason: HardFilterFailureReason;
  accepts: (profile: ProfileDocument, other: ProfileDocument, otherAge: number | null) => boolean;
}> = [
  { reason: "gender", accepts: (p, o) => acceptsGender(p, o.visible.gender) },
  { reason: "age", accepts: (p, _o, otherAge) => acceptsAge(p, otherAge) },
  { reason: "distance", accepts: (p, o) => acceptsDistance(p, o) },
  { reason: "relationship_intention", accepts: (p, o) => acceptsIntention(p, o) },
  { reason: "smoking", accepts: (p, o) => acceptsSmoking(p, o) },
  { reason: "young_children", accepts: (p, o) => acceptsYoungChildren(p, o) },
];

export interface HardFilterEvaluation {
  passes: boolean;
  /**
   * The first check (in CHECKS order) that failed, checking a's acceptance
   * of b first, then b's acceptance of a — null when passes is true. Used
   * to bucket per-run rejection diagnostics (see engine.ts /
   * MemberRunDiagnostics) without ever logging a per-candidate reason list.
   */
  failureReason: HardFilterFailureReason | null;
}

/**
 * Reciprocal hard-filter evaluation with an explainable failure reason —
 * `passesHardFilters` below is a thin boolean-only wrapper over this, so
 * every existing caller's behavior is completely unchanged.
 */
export function evaluateHardFilters(a: ProfileDocument, b: ProfileDocument): HardFilterEvaluation {
  const ageA = ageOf(a);
  const ageB = ageOf(b);

  for (const { reason, accepts } of CHECKS) {
    if (!accepts(a, b, ageB)) return { passes: false, failureReason: reason };
  }
  for (const { reason, accepts } of CHECKS) {
    if (!accepts(b, a, ageA)) return { passes: false, failureReason: reason };
  }
  return { passes: true, failureReason: null };
}

/** True only if BOTH profiles' dealbreakers would accept the other. */
export function passesHardFilters(a: ProfileDocument, b: ProfileDocument): boolean {
  return evaluateHardFilters(a, b).passes;
}

export interface HardFilterFailure {
  reason: HardFilterFailureReason;
  /** Which side's dealbreaker rejected the other — for a human-readable admin explanation. */
  direction: "a_rejects_b" | "b_rejects_a";
}

/**
 * Every failing check, in both directions — unlike `evaluateHardFilters`
 * (which stops at the first failure for cheap aggregate diagnostics), this
 * is for the manual-suggestion admin UI, which needs to show the operator
 * the complete list of failed requirements before refusing to let them
 * send a suggestion that breaks one, not just the first one found.
 */
export function evaluateHardFiltersDetailed(a: ProfileDocument, b: ProfileDocument): HardFilterFailure[] {
  const ageA = ageOf(a);
  const ageB = ageOf(b);
  const failures: HardFilterFailure[] = [];
  for (const { reason, accepts } of CHECKS) {
    if (!accepts(a, b, ageB)) failures.push({ reason, direction: "a_rejects_b" });
  }
  for (const { reason, accepts } of CHECKS) {
    if (!accepts(b, a, ageA)) failures.push({ reason, direction: "b_rejects_a" });
  }
  return failures;
}
