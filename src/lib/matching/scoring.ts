import type { ProfileDocument } from "@/lib/introduction/types";

/**
 * Deterministic, versioned, fully explainable weighted scoring — no opaque
 * AI decision-maker. Each dimension is a reciprocal soft signal derived
 * only from fields both people actually filled in; an unset preference on
 * either side is treated as neutral (full credit) rather than a penalty,
 * since `preferences` (unlike `dealbreakers`) is optional by design.
 *
 * `scoringVersion` is recorded on every proposal so weights can be
 * recalibrated later from real Interested/Pass/mutual outcomes without
 * losing the ability to see what version produced a historical proposal.
 */

export const SCORING_VERSION = 1;

const WEIGHTS_V1 = {
  heightFit: 15,
  drinkingFit: 15,
  activityFit: 20,
  cityBonus: 20,
  languageOverlap: 15,
  educationAlignment: 15,
};

const TOTAL_WEIGHT_V1 = Object.values(WEIGHTS_V1).reduce((a, b) => a + b, 0);

function heightFit(a: ProfileDocument, b: ProfileDocument): number {
  const checks: boolean[] = [];
  const { heightMinCm: aMin, heightMaxCm: aMax } = a.preferences;
  if ((aMin !== null || aMax !== null) && b.visible.heightCm !== null) {
    checks.push(
      (aMin === null || b.visible.heightCm >= aMin) &&
        (aMax === null || b.visible.heightCm <= aMax),
    );
  }
  const { heightMinCm: bMin, heightMaxCm: bMax } = b.preferences;
  if ((bMin !== null || bMax !== null) && a.visible.heightCm !== null) {
    checks.push(
      (bMin === null || a.visible.heightCm >= bMin) &&
        (bMax === null || a.visible.heightCm <= bMax),
    );
  }
  if (checks.length === 0) return 1;
  return checks.filter(Boolean).length / checks.length;
}

function membershipFit<T>(aPref: T[], bValue: T | null, bPref: T[], aValue: T | null): number {
  const checks: boolean[] = [];
  if (aPref.length > 0 && bValue !== null) checks.push(aPref.includes(bValue));
  if (bPref.length > 0 && aValue !== null) checks.push(bPref.includes(aValue));
  if (checks.length === 0) return 1;
  return checks.filter(Boolean).length / checks.length;
}

function cityBonus(a: ProfileDocument, b: ProfileDocument): number {
  const cityA = a.visible.city.trim().toLowerCase();
  const cityB = b.visible.city.trim().toLowerCase();
  if (!cityA || !cityB) return 0;
  return cityA === cityB ? 1 : 0;
}

function languageOverlap(a: ProfileDocument, b: ProfileDocument): number {
  const langsA = new Set(a.visible.languages);
  const langsB = new Set(b.visible.languages);
  if (langsA.size === 0 || langsB.size === 0) return 0;
  const intersection = [...langsA].filter((l) => langsB.has(l)).length;
  const union = new Set([...langsA, ...langsB]).size;
  return union === 0 ? 0 : intersection / union;
}

function educationAlignment(a: ProfileDocument, b: ProfileDocument): number {
  if (!a.visible.educationLevel || !b.visible.educationLevel) return 0;
  return a.visible.educationLevel === b.visible.educationLevel ? 1 : 0;
}

/** Returns a 0-100 compatibility score. Version 1 weighting — see WEIGHTS_V1. */
export function scorePair(a: ProfileDocument, b: ProfileDocument): number {
  const raw =
    WEIGHTS_V1.heightFit * heightFit(a, b) +
    WEIGHTS_V1.drinkingFit *
      membershipFit(a.preferences.drinkingAccepted, b.visible.drinking, b.preferences.drinkingAccepted, a.visible.drinking) +
    WEIGHTS_V1.activityFit *
      membershipFit(
        a.preferences.activityLevelsPreferred,
        b.visible.activityLevel,
        b.preferences.activityLevelsPreferred,
        a.visible.activityLevel,
      ) +
    WEIGHTS_V1.cityBonus * cityBonus(a, b) +
    WEIGHTS_V1.languageOverlap * languageOverlap(a, b) +
    WEIGHTS_V1.educationAlignment * educationAlignment(a, b);

  return Math.round((raw / TOTAL_WEIGHT_V1) * 100);
}
