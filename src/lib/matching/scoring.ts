import type { ProfileDocument } from "@/lib/introduction/types";

/**
 * Deterministic, versioned, fully explainable weighted scoring — no opaque
 * AI decision-maker. V2 replaces V1's "unstated preference = full neutral
 * credit" design (see README "Scoring V2" for the audit that found it):
 * a dimension that has no real, evaluable signal for a given pair is
 * excluded entirely from that pair's score — never treated as a match,
 * never treated as a mismatch. See `scorePair` for how that's combined
 * with a coverage/confidence safeguard so a pair with very little
 * evaluable signal still can't be manufactured into a high score just by
 * having one lucky dimension.
 *
 * `scoringVersion` is recorded on every proposal so weights (and, as
 * happened here, the formula itself) can be recalibrated later from real
 * Interested/Pass/mutual outcomes without losing the ability to see what
 * version produced a historical proposal. V4 removes the short-lived
 * `childrenPreferenceFit` dimension (V3): the product model was simplified
 * to a single hard under-15 dealbreaker with no soft children-related
 * scoring signal at all — see hardFilters.ts acceptsYoungChildren and the
 * children-model simplification this followed.
 */

export const SCORING_VERSION = 4;

type DimensionName =
  | "activityFit"
  | "relationshipIntentionAlignment"
  | "drinkingFit"
  | "heightFit"
  | "languageOverlap"
  | "educationAlignment";

/**
 * Weights are relative-importance judgments, not empirically validated —
 * see README/audit notes. City is deliberately not a dimension here at
 * all anymore: Madrid-only eligibility is already an engine.ts pool gate
 * (loadEligiblePool), and with a single-market, mostly free-text "Madrid"
 * city field, a same-city bonus rewarded nearly everyone equally without
 * helping ranking.
 */
const WEIGHTS_V4: Record<DimensionName, number> = {
  activityFit: 20,
  relationshipIntentionAlignment: 20,
  drinkingFit: 15,
  heightFit: 15,
  languageOverlap: 15,
  // Deliberately a minor signal, not a major ranking driver (see README):
  // exact-category alignment only, no adjacency logic, and explicitly
  // must never rank people by educational "status" — this is the
  // smallest change that stops it dominating the score the way its
  // former weight of 15 (equal to language) did.
  educationAlignment: 5,
};

const TOTAL_WEIGHT_V4 = Object.values(WEIGHTS_V4).reduce((a, b) => a + b, 0);

/**
 * A pair needs at least this fraction of the total possible weight to be
 * genuinely evaluable before the score is reported at full confidence.
 * Below it, the score is scaled down proportionally — the mechanism that
 * stops a single lucky evaluable dimension from producing a manufactured
 * high score out of an otherwise-blank pair. A tunable constant, not a
 * validated one; see README.
 */
const MIN_COVERAGE_FOR_FULL_CONFIDENCE = 0.5;

interface DimensionResult {
  evaluable: boolean;
  /** 0-1. Only meaningful when evaluable is true. */
  fit: number;
}

export interface ScoreDimensionBreakdown {
  dimension: DimensionName;
  weight: number;
  evaluable: boolean;
  /** 0-1, or null when not evaluable for this pair. */
  fit: number | null;
  /** weight * fit when evaluable, else 0. */
  contribution: number;
}

export interface ScoreResult {
  /** 0-100, the number everything else (threshold, ranking) uses. */
  score: number;
  scoringVersion: number;
  /** Fraction (0-1) of total possible weight that was actually evaluable for this pair. */
  coverage: number;
  /** Fraction (0-1) coverage was scaled down by, per MIN_COVERAGE_FOR_FULL_CONFIDENCE. */
  confidence: number;
  /** 0-1, the raw quality of fit over only the evaluable dimensions, before the confidence scale-down. */
  fitQuality: number;
  breakdown: ScoreDimensionBreakdown[];
}

const NOT_EVALUABLE: DimensionResult = { evaluable: false, fit: 0 };

/**
 * Reciprocal, per-direction evaluability: A's stated preference is only
 * evaluable against B's self-report (and vice versa) — a preference with
 * no corresponding self-report on the other side contributes nothing, in
 * either direction, rather than being silently dropped as if it were
 * never asked. The two directions are independent; either, both, or
 * neither may be evaluable for a given pair.
 */
function heightFit(a: ProfileDocument, b: ProfileDocument): DimensionResult {
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
  if (checks.length === 0) return NOT_EVALUABLE;
  return { evaluable: true, fit: checks.filter(Boolean).length / checks.length };
}

/** Same per-direction evaluability contract as heightFit, generic over drinking/activity. */
function membershipFit<T>(aPref: T[], bValue: T | null, bPref: T[], aValue: T | null): DimensionResult {
  const checks: boolean[] = [];
  if (aPref.length > 0 && bValue !== null) checks.push(aPref.includes(bValue));
  if (bPref.length > 0 && aValue !== null) checks.push(bPref.includes(aValue));
  if (checks.length === 0) return NOT_EVALUABLE;
  return { evaluable: true, fit: checks.filter(Boolean).length / checks.length };
}

/** Both languages are required fields, so this is effectively always evaluable in practice. */
function languageOverlap(a: ProfileDocument, b: ProfileDocument): DimensionResult {
  const langsA = new Set(a.visible.languages);
  const langsB = new Set(b.visible.languages);
  if (langsA.size === 0 || langsB.size === 0) return NOT_EVALUABLE;
  const intersection = [...langsA].filter((l) => langsB.has(l)).length;
  const union = new Set([...langsA, ...langsB]).size;
  return { evaluable: true, fit: union === 0 ? 0 : intersection / union };
}

const REAL_EDUCATION_LEVELS = new Set(["formacion_profesional", "universidad", "master_doctorado"]);

/**
 * "prefiero_no_decirlo" is a decline-to-answer, not an education level —
 * it must never be compared as if it were one. Previously
 * `!a.visible.educationLevel` only excluded an actual `null`, so two
 * people who both declined scored a full match; now both sides must have
 * a REAL level for this to be evaluable at all.
 */
function educationAlignment(a: ProfileDocument, b: ProfileDocument): DimensionResult {
  const levelA = a.visible.educationLevel;
  const levelB = b.visible.educationLevel;
  if (!levelA || !levelB || !REAL_EDUCATION_LEVELS.has(levelA) || !REAL_EDUCATION_LEVELS.has(levelB)) {
    return NOT_EVALUABLE;
  }
  return { evaluable: true, fit: levelA === levelB ? 1 : 0 };
}

/**
 * Soft ranking signal ONLY among pairs that already passed the reciprocal
 * relationshipIntentionsAccepted hard filter (hardFilters.ts) — this
 * function is never called before that, and nothing here can override or
 * substitute for it. Both sides' intention is a required field and is
 * guaranteed non-null for any pair reaching scoring, so this is always
 * evaluable in practice; the null check is defensive.
 *
 * Deliberately a flat two-tier table, not the 3-tier distance table
 * considered during design — an exact match is a stronger signal than
 * any other accepted-but-different combination, and that's the only
 * distinction asserted here. Both values (1.0 / 0.5) are initial product
 * assumptions, not validated from outcomes — easy to find and revise
 * here, and covered by SCORING_VERSION so a future recalibration is
 * traceable against which proposals used which values.
 */
function relationshipIntentionAlignment(a: ProfileDocument, b: ProfileDocument): DimensionResult {
  const intentionA = a.visible.relationshipIntention;
  const intentionB = b.visible.relationshipIntention;
  if (intentionA === null || intentionB === null) return NOT_EVALUABLE;
  return { evaluable: true, fit: intentionA === intentionB ? 1.0 : 0.5 };
}

/**
 * Returns a 0-100 compatibility score plus the full per-dimension
 * breakdown (for internal persistence/analysis — see README "Scoring V2"
 * and analytics.ts). Dimensions with no evaluable signal for this pair
 * are excluded from both the numerator and the weight denominator
 * (`fitQuality`) — never scored as a match, never as a mismatch. A
 * separate `confidence` factor then scales down the final score when too
 * little of the total possible weight was evaluable at all, which is
 * what stops a single evaluable dimension (e.g. only language overlap)
 * from producing a manufactured high score for an otherwise-blank pair —
 * see the worked examples in README.
 *
 * Deliberately no children-related dimension: children matching is a
 * single hard dealbreaker (hardFilters.ts acceptsYoungChildren) with no
 * soft/scored component at all — see the children-model simplification.
 */
export function scorePair(a: ProfileDocument, b: ProfileDocument): ScoreResult {
  const results: Record<DimensionName, DimensionResult> = {
    activityFit: membershipFit(
      a.preferences.activityLevelsPreferred,
      b.visible.activityLevel,
      b.preferences.activityLevelsPreferred,
      a.visible.activityLevel,
    ),
    relationshipIntentionAlignment: relationshipIntentionAlignment(a, b),
    drinkingFit: membershipFit(a.preferences.drinkingAccepted, b.visible.drinking, b.preferences.drinkingAccepted, a.visible.drinking),
    heightFit: heightFit(a, b),
    languageOverlap: languageOverlap(a, b),
    educationAlignment: educationAlignment(a, b),
  };

  const breakdown: ScoreDimensionBreakdown[] = (Object.keys(WEIGHTS_V4) as DimensionName[]).map((dimension) => {
    const weight = WEIGHTS_V4[dimension];
    const result = results[dimension];
    return {
      dimension,
      weight,
      evaluable: result.evaluable,
      fit: result.evaluable ? result.fit : null,
      contribution: result.evaluable ? weight * result.fit : 0,
    };
  });

  const evaluableWeight = breakdown.reduce((sum, d) => sum + (d.evaluable ? d.weight : 0), 0);
  const raw = breakdown.reduce((sum, d) => sum + d.contribution, 0);

  const fitQuality = evaluableWeight === 0 ? 0 : raw / evaluableWeight;
  const coverage = evaluableWeight / TOTAL_WEIGHT_V4;
  const confidence = Math.min(1, coverage / MIN_COVERAGE_FOR_FULL_CONFIDENCE);
  const score = evaluableWeight === 0 ? 0 : Math.round(fitQuality * confidence * 100);

  return { score, scoringVersion: SCORING_VERSION, coverage, confidence, fitQuality, breakdown };
}
