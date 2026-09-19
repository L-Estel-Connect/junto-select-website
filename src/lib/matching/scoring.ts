import type { ProfileDocument } from "@/lib/introduction/types";

/**
 * Deterministic, versioned, fully explainable weighted scoring — no opaque
 * AI decision-maker. Since V2, a dimension that has no real, evaluable
 * signal for a given pair is excluded entirely from that pair's score —
 * never treated as a match, never treated as a mismatch. See `scorePair`
 * for how that's combined with a coverage/confidence safeguard so a pair
 * with very little evaluable signal still can't be manufactured into a
 * high score just by having one lucky dimension.
 *
 * `scoringVersion` is recorded on every proposal so weights (and, as
 * happened before, the formula itself) can be recalibrated later from
 * real Interested/Pass/mutual outcomes without losing the ability to see
 * what version produced a historical proposal.
 *
 * V5 is the matching-model redesign: future-children compatibility moves
 * IN from a hard filter (removed — hardFilters.ts used to have an
 * `acceptsFutureChildrenIntention` check) to a new
 * `futureChildrenAlignment` dimension comparing both sides' own stated
 * intent, since a hard reject there was judged too strict. Income joins
 * scoring for the first time (`incomeCompatibility`) — bracket-distance
 * only, never the raw bracket itself, and never exposed to either member
 * (see publicProfile.ts, which never includes `private.incomeRange`).
 * `educationAlignment` gains ordinal adjacency (previously exact-match
 * only) and `languageOverlap` is rebalanced to reward ANY shared language
 * highly rather than penalizing a large union (previously a strict
 * intersection/union Jaccard index, which under-rewarded two people who
 * share every language they speak but one of them lists more of them).
 * Every other dimension keeps its V4 formula, just reweighted — see the
 * weight table below.
 */

export const SCORING_VERSION = 5;

type DimensionName =
  | "activityFit"
  | "relationshipIntentionAlignment"
  | "drinkingFit"
  | "heightFit"
  | "languageOverlap"
  | "educationAlignment"
  | "futureChildrenAlignment"
  | "incomeCompatibility";

/**
 * Weights are relative-importance judgments, not empirically validated —
 * see README/audit notes. City is deliberately not a dimension here at
 * all: Madrid-only eligibility is already an engine.ts pool gate
 * (loadEligiblePool), and with a single-market, mostly free-text "Madrid"
 * city field, a same-city bonus rewarded nearly everyone equally without
 * helping ranking.
 *
 * Relationship intention and height are the two heaviest signals now
 * (25/20). `futureChildrenAlignment` (20) reflects how consequential
 * wanting-more-kids alignment is for this audience even as a *soft*
 * signal now that it's no longer a hard filter. `incomeCompatibility`/
 * `educationAlignment` (10 each) are deliberately modest, secondary
 * signals — see each function's own doc comment for why neither should
 * dominate. Activity and drinking are cut to token weights (3/2): both
 * are lifestyle preferences judged low-priority relative to the above,
 * but kept as tie-breaker signals rather than removed outright.
 */
const WEIGHTS_V5: Record<DimensionName, number> = {
  relationshipIntentionAlignment: 25,
  heightFit: 20,
  futureChildrenAlignment: 20,
  incomeCompatibility: 10,
  educationAlignment: 10,
  languageOverlap: 10,
  activityFit: 3,
  drinkingFit: 2,
};

const TOTAL_WEIGHT_V5 = Object.values(WEIGHTS_V5).reduce((a, b) => a + b, 0);

/**
 * A pair needs at least this fraction of the total possible weight to be
 * genuinely evaluable before the score is reported at full confidence.
 * Below it, the score is scaled down proportionally — the mechanism that
 * stops a single lucky evaluable dimension from producing a manufactured
 * high score out of an otherwise-blank pair. Kept at 0.5 for V5, same as
 * every prior version, after explicitly re-checking it against the new
 * weight table rather than carrying it over blindly:
 * `relationshipIntentionAlignment` (25) + `futureChildrenAlignment` (20) +
 * `languageOverlap` (10) = 55, and all three are guaranteed evaluable for
 * every pair reaching scoring (relationshipIntention/wantsFutureChildren/
 * languages are all required, non-skippable onboarding fields, and
 * relationshipIntentionAlignment is only ever scored for pairs that
 * already passed the reciprocal relationshipIntentionsAccepted hard
 * filter). That's 0.55 of total weight — just over the 0.5 floor — so a
 * pair evaluable on only these three "always-on" dimensions still reaches
 * full confidence, exactly as intended: requiring MORE than the fields
 * nobody can skip before trusting a score would confidence-cap every real
 * profile by default, defeating the point of the safeguard. A pair
 * evaluable on FEWER than all three (only possible with missing/corrupted
 * onboarding data, since these fields are required) still falls under 0.5
 * and gets scaled down, which is correct.
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

/**
 * Both languages are required fields, so this is effectively always
 * evaluable in practice. V5 replaces the strict intersection/union Jaccard
 * index (which penalized a large union — e.g. someone speaking 4 languages
 * scored a weak overlap with someone speaking only their 1 shared
 * language) with a formula that rewards ANY shared language highly: zero
 * shared languages is still a genuine mismatch (0), but even one shared
 * language already scores 0.85, with each additional shared language
 * adding a small bonus up to a 1.0 cap. Sharing a language at all is what
 * actually matters for this audience (can they talk to each other?), not
 * what fraction of either person's full language list overlaps.
 */
function languageOverlap(a: ProfileDocument, b: ProfileDocument): DimensionResult {
  const langsA = new Set(a.visible.languages);
  const langsB = new Set(b.visible.languages);
  if (langsA.size === 0 || langsB.size === 0) return NOT_EVALUABLE;
  const intersectionSize = [...langsA].filter((l) => langsB.has(l)).length;
  if (intersectionSize === 0) return { evaluable: true, fit: 0 };
  return { evaluable: true, fit: Math.min(1.0, 0.85 + 0.05 * (intersectionSize - 1)) };
}

const REAL_EDUCATION_LEVELS = new Set(["formacion_profesional", "universidad", "master_doctorado"]);

/** Ordinal rank for adjacency distance — see `educationAlignment`. */
const EDUCATION_RANK: Record<string, number> = {
  formacion_profesional: 0,
  universidad: 1,
  master_doctorado: 2,
};

/**
 * "prefiero_no_decirlo" is a decline-to-answer, not an education level —
 * it must never be compared as if it were one; both sides must have a
 * REAL level for this to be evaluable at all (a fix carried over from
 * V2-V4: previously two people who both declined scored a full match).
 *
 * V5 adds ordinal ADJACENCY instead of exact-match-only: the three real
 * levels form a scale, and one step apart (e.g. universidad vs
 * master_doctorado) is a much smaller mismatch than two steps apart
 * (formacion_profesional vs master_doctorado). Still deliberately a minor
 * signal (see WEIGHTS_V5) and must never be read as ranking people by
 * educational "status" — it only measures how close two stated levels
 * are on the same scale.
 */
function educationAlignment(a: ProfileDocument, b: ProfileDocument): DimensionResult {
  const levelA = a.visible.educationLevel;
  const levelB = b.visible.educationLevel;
  if (!levelA || !levelB || !REAL_EDUCATION_LEVELS.has(levelA) || !REAL_EDUCATION_LEVELS.has(levelB)) {
    return NOT_EVALUABLE;
  }
  const distance = Math.abs(EDUCATION_RANK[levelA] - EDUCATION_RANK[levelB]);
  const fit = distance === 0 ? 1.0 : distance === 1 ? 0.5 : 0.0;
  return { evaluable: true, fit };
}

/**
 * Mutual self-report scoring signal comparing both sides' OWN stated
 * desire to have children in the future (`visible.wantsFutureChildren`) —
 * the replacement for the removed `future_children` HARD filter (see
 * hardFilters.ts's module doc comment): a straight si/no mismatch is
 * still a strong negative signal (0.15, not 0 — see below), but no longer
 * an automatic exclusion, since product judged a hard reject too strict
 * here. Both sides answer the identical question (unlike the removed
 * dealbreaker, which compared one side's REQUIREMENT of the other against
 * the other's self-report) — comparison is inherently symmetric.
 *
 * Fit table: si+si or no+no = 1.0 (fully aligned); either side "no_lo_se"
 * against a definite si/no = 0.6 (genuinely open, not a mismatch, but not
 * a confirmed match either); no_lo_se+no_lo_se = 0.5 (neither has
 * decided, so neither confirmed alignment nor mismatch); si+no = 0.15
 * (opposite desires — not 0, since "wants kids" vs "doesn't" is a real
 * but not always fully disqualifying difference now that it's scoring,
 * not a hard filter). `wantsFutureChildren` is a required onboarding
 * field, so this is effectively always evaluable in practice; the null
 * check is defensive.
 */
function futureChildrenAlignment(a: ProfileDocument, b: ProfileDocument): DimensionResult {
  const wantsA = a.visible.wantsFutureChildren;
  const wantsB = b.visible.wantsFutureChildren;
  if (wantsA === null || wantsB === null) return NOT_EVALUABLE;
  if (wantsA === wantsB) return { evaluable: true, fit: wantsA === "no_lo_se" ? 0.5 : 1.0 };
  if (wantsA === "no_lo_se" || wantsB === "no_lo_se") return { evaluable: true, fit: 0.6 };
  return { evaluable: true, fit: 0.15 }; // si vs no, in either order
}

/** Ordinal rank for bracket-distance — see `incomeCompatibility`. */
const INCOME_BRACKET_RANK: Record<string, number> = {
  menos_40k: 0,
  "40k_80k": 1,
  "80k_150k": 2,
  mas_150k: 3,
};

/** Distance (0-3 brackets apart) -> fit. Indexed by `Math.abs(rankA - rankB)`. */
const INCOME_DISTANCE_FIT = [1.0, 0.66, 0.33, 0.0];

/**
 * Lifestyle-compatibility signal from `private.incomeRange` bracket
 * distance only — never the raw bracket itself, which is never persisted
 * anywhere a member (or an admin's ordinary view) can read; see
 * publicProfile.ts (never includes `private.incomeRange`) and
 * memberDetail.ts/why.ts (the admin "why" breakdown surfaces this
 * dimension's `fit`/`contribution` like any other, never the underlying
 * bracket value). "prefiero_no_decirlo" on EITHER side, same as
 * `educationAlignment`'s handling of its own decline-to-answer option,
 * makes this non-evaluable rather than compared as if it were a real
 * bracket — declining to state income must never be silently treated as
 * a specific income level.
 */
function incomeCompatibility(a: ProfileDocument, b: ProfileDocument): DimensionResult {
  const incomeA = a.private.incomeRange;
  const incomeB = b.private.incomeRange;
  if (!incomeA || !incomeB || incomeA === "prefiero_no_decirlo" || incomeB === "prefiero_no_decirlo") {
    return NOT_EVALUABLE;
  }
  const distance = Math.abs(INCOME_BRACKET_RANK[incomeA] - INCOME_BRACKET_RANK[incomeB]);
  return { evaluable: true, fit: INCOME_DISTANCE_FIT[distance] };
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
 * Young-children compatibility stays a single hard dealbreaker only
 * (hardFilters.ts acceptsYoungChildren) with no soft/scored component —
 * future-children compatibility (a DIFFERENT question — whether both
 * people want MORE children later) is the only children-related aspect
 * that's ever scored, via `futureChildrenAlignment` below.
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
    futureChildrenAlignment: futureChildrenAlignment(a, b),
    incomeCompatibility: incomeCompatibility(a, b),
  };

  const breakdown: ScoreDimensionBreakdown[] = (Object.keys(WEIGHTS_V5) as DimensionName[]).map((dimension) => {
    const weight = WEIGHTS_V5[dimension];
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
  const coverage = evaluableWeight / TOTAL_WEIGHT_V5;
  const confidence = Math.min(1, coverage / MIN_COVERAGE_FOR_FULL_CONFIDENCE);
  const score = evaluableWeight === 0 ? 0 : Math.round(fitQuality * confidence * 100);

  return { score, scoringVersion: SCORING_VERSION, coverage, confidence, fitQuality, breakdown };
}
