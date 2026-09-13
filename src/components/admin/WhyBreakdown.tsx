"use client";

import { useState } from "react";
import type { MatchWhy } from "@/lib/admin/why";
import Badge from "./Badge";

const SYMBOL: Record<string, string> = { check: "✓", warn: "△", cross: "✗", dash: "—" };
const SYMBOL_TONE: Record<string, "positive" | "warning" | "negative" | "muted"> = {
  check: "positive",
  warn: "warning",
  cross: "negative",
  dash: "muted",
};

/**
 * The deterministic "why" explainer (spec §7): the score and every line
 * here come directly from the persisted scoring breakdown via
 * computeMatchWhy — nothing is generated or embellished here.
 */
export default function WhyBreakdown({ why }: { why: MatchWhy }) {
  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <div className="rounded-xl border border-hairline bg-white p-5">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-ink-soft">Puntuación de compatibilidad</p>
          <p className="mt-1 font-serif text-[28px] text-ink">{why.score} / 100</p>
        </div>
        <div className="text-right text-[12px] text-ink-soft">
          <p>Confianza: <span className="font-medium text-ink">{why.confidenceLabel}</span></p>
          <p>Datos evaluados: <span className="font-medium text-ink">{why.coveragePercent}%</span></p>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {why.lines.map((line) => (
          <li key={line.dimension} className="flex items-start gap-2 text-[14px]">
            <Badge tone={SYMBOL_TONE[line.symbol]}>{SYMBOL[line.symbol]}</Badge>
            <span className="text-ink">{line.text}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setShowTechnical((v) => !v)}
        className="mt-4 text-[12px] font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink"
      >
        {showTechnical ? "Ocultar detalle técnico" : "Ver detalle técnico"}
      </button>

      {showTechnical && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="text-ink-soft">
                <th className="py-1 pr-4 font-medium">Dimensión</th>
                <th className="py-1 pr-4 font-medium">Peso</th>
                <th className="py-1 pr-4 font-medium">Evaluado</th>
                <th className="py-1 pr-4 font-medium">Fit</th>
                <th className="py-1 font-medium">Contribución</th>
              </tr>
            </thead>
            <tbody>
              {why.lines.map((line) => (
                <tr key={line.dimension} className="border-t border-hairline/70">
                  <td className="py-1.5 pr-4 text-ink">{line.dimensionLabel}</td>
                  <td className="py-1.5 pr-4 text-ink-soft">{line.weight}</td>
                  <td className="py-1.5 pr-4 text-ink-soft">{line.fit === null ? "No" : "Sí"}</td>
                  <td className="py-1.5 pr-4 text-ink-soft">{line.fit === null ? "—" : line.fit.toFixed(2)}</td>
                  <td className="py-1.5 text-ink-soft">{line.contribution.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-ink-soft">
            Versión del algoritmo de puntuación: {why.scoringVersion} · Confianza numérica: {why.confidence.toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
}
