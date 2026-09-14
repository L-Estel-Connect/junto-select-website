import type { ScoreDimensionBreakdown, ScoreResult } from "@/lib/matching/scoring";

/**
 * Deterministic "why did the algorithm rank this pair the way it did"
 * explainer — generated ONLY from the actual persisted scoring breakdown,
 * never from a language model and never inventing a claim the numbers
 * don't support. See the Admin Dashboard spec §7: a weak contribution must
 * never be described as strong, and a non-evaluated dimension must say so
 * rather than being silently omitted or implied to be a mismatch.
 *
 * Four fixed strength tiers per evaluable dimension (thresholds are a
 * presentation choice over the existing 0-1 `fit` value — they introduce
 * no new number, just a human label for one that already exists):
 *   fit >= 0.75           -> "good fit"      (✓)
 *   0.5 <= fit < 0.75      -> "partial fit"   (✓, but explicitly partial)
 *   0 < fit < 0.5          -> "weak fit"       (△, never phrased as strong)
 *   fit === 0              -> "mismatch"       (✗)
 * Not evaluable -> "not evaluated" (—), never treated as a match or a
 * mismatch.
 */

const DIMENSION_NAMES: Record<ScoreDimensionBreakdown["dimension"], string> = {
  activityFit: "Nivel de actividad física",
  relationshipIntentionAlignment: "Tipo de relación buscada",
  drinkingFit: "Consumo de alcohol",
  heightFit: "Altura",
  languageOverlap: "Idiomas en común",
  educationAlignment: "Formación",
  childrenPreferenceFit: "Preferencia sobre hijos de la otra persona",
};

export type WhyTier = "good" | "partial" | "weak" | "mismatch" | "not_evaluated";

export interface WhyLine {
  dimension: string;
  dimensionLabel: string;
  tier: WhyTier;
  /** ✓ / △ / ✗ / — for compact rendering. */
  symbol: "check" | "warn" | "cross" | "dash";
  text: string;
  weight: number;
  fit: number | null;
  contribution: number;
}

function tierFor(fit: number): WhyTier {
  if (fit >= 0.75) return "good";
  if (fit >= 0.5) return "partial";
  if (fit > 0) return "weak";
  return "mismatch";
}

function symbolFor(tier: WhyTier): WhyLine["symbol"] {
  switch (tier) {
    case "good":
    case "partial":
      return "check";
    case "weak":
      return "warn";
    case "mismatch":
      return "cross";
    case "not_evaluated":
      return "dash";
  }
}

function textFor(name: string, tier: WhyTier): string {
  switch (tier) {
    case "good":
      return `${name}: buena compatibilidad`;
    case "partial":
      return `${name}: compatibilidad parcial`;
    case "weak":
      return `${name}: compatibilidad baja`;
    case "mismatch":
      return `${name}: no coincide`;
    case "not_evaluated":
      return `${name}: sin datos suficientes para evaluarlo`;
  }
}

export function explainDimension(d: ScoreDimensionBreakdown): WhyLine {
  const name = DIMENSION_NAMES[d.dimension];
  const tier: WhyTier = d.evaluable && d.fit !== null ? tierFor(d.fit) : "not_evaluated";
  return {
    dimension: d.dimension,
    dimensionLabel: name,
    tier,
    symbol: symbolFor(tier),
    text: textFor(name, tier),
    weight: d.weight,
    fit: d.fit,
    contribution: d.contribution,
  };
}

/** Evaluated dimensions first (highest contribution first), then non-evaluated ones — reasons that actually drove the score come first. */
export function explainBreakdown(breakdown: ScoreDimensionBreakdown[]): WhyLine[] {
  return [...breakdown]
    .sort((a, b) => {
      if (a.evaluable !== b.evaluable) return a.evaluable ? -1 : 1;
      return b.contribution - a.contribution;
    })
    .map(explainDimension);
}

export type ConfidenceLabel = "Alta" | "Media" | "Baja";

/** A presentation label over the existing `confidence` number — introduces no new metric. */
export function confidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.85) return "Alta";
  if (confidence >= 0.5) return "Media";
  return "Baja";
}

export interface MatchWhy {
  score: number;
  scoringVersion: number;
  coveragePercent: number;
  confidenceLabel: ConfidenceLabel;
  confidence: number;
  lines: WhyLine[];
}

export function computeMatchWhy(result: Pick<ScoreResult, "score" | "scoringVersion" | "coverage" | "confidence" | "breakdown">): MatchWhy {
  return {
    score: result.score,
    scoringVersion: result.scoringVersion,
    coveragePercent: Math.round(result.coverage * 100),
    confidenceLabel: confidenceLabel(result.confidence),
    confidence: result.confidence,
    lines: explainBreakdown(result.breakdown),
  };
}
