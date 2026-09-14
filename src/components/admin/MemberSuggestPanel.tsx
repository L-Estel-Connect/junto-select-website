"use client";

import { useState } from "react";
import { adminFetch } from "@/lib/admin/adminFetch";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import PhotoThumb from "./PhotoThumb";
import Badge from "./Badge";
import {
  ABOUT_ME_FIELD_LABELS,
  ELIGIBILITY_REASON_LABELS,
  PREFERENCES_FIELD_LABELS,
  genderLabel,
  hardFilterFailureLabel,
  manualSuggestionErrorLabel,
  PAIR_HISTORY_REASON_LABELS,
} from "@/lib/admin/labels";
import { computeMatchWhy } from "@/lib/admin/why";
import type { ScoreResult } from "@/lib/matching/scoring";

interface HardFilterFailure {
  reason: string;
  direction: "a_rejects_b" | "b_rejects_a";
}

/** Mirrors eligibility.ts's EligibilityDiagnosis shape (server response, not re-imported to keep this component free of server-only modules). */
interface EligibilityDiagnosis {
  eligible: boolean;
  reasons: string[];
  profileStatus: {
    storedStatus: string;
    computedStatus: string;
    stale: boolean;
    sections: {
      aboutMe: { complete: boolean; missingFields: string[] };
      photos: { complete: boolean };
      preferences: { complete: boolean; missingFields: string[] };
      presentation: { complete: boolean };
    };
  };
}

interface CandidateResult {
  uid: string;
  personId: string;
  firstName: string;
  age: number | null;
  gender: string | null;
  city: string;
  photoPath: string | null;
  searchStatus: string;
  hardFilterFailures: HardFilterFailure[];
  pairHistoryReason: string | null;
  alreadySuggested: boolean;
  score: ScoreResult | null;
  canSuggest: boolean;
}

interface CandidatesResponse {
  candidates: CandidateResult[];
  /** Set (candidates always []) when the RECIPIENT themself isn't eligible — checked before any candidate is ever searched or scored. */
  notEligible: EligibilityDiagnosis | null;
}

function eligibilityReasonLines(diagnosis: EligibilityDiagnosis): string[] {
  const lines = diagnosis.reasons.map((r) => ELIGIBILITY_REASON_LABELS[r] ?? r);
  if (diagnosis.reasons.includes("profile_status_not_active")) {
    const { aboutMe, preferences } = diagnosis.profileStatus.sections;
    if (!aboutMe.complete) {
      lines.push(
        `Sobre ti — falta: ${aboutMe.missingFields.map((f) => ABOUT_ME_FIELD_LABELS[f] ?? f).join(", ")}`,
      );
    }
    if (!preferences.complete) {
      lines.push(
        `Lo que busca — falta: ${preferences.missingFields.map((f) => PREFERENCES_FIELD_LABELS[f] ?? f).join(", ")}`,
      );
    }
    if (!diagnosis.profileStatus.sections.photos.complete) lines.push("Fotos — falta al menos una foto");
    if (diagnosis.profileStatus.stale) {
      lines.push(
        "El estado guardado no coincide con los datos actuales del perfil (probablemente por un cambio de criterios posterior) — usa \"Recalcular estado\" en la ficha del miembro.",
      );
    }
  }
  return lines;
}

/**
 * "Founder suggestion" — spec §12. Every safety check shown here (hard
 * filters, pair history, duplicate exclusion) is re-verified server-side
 * again when actually creating the suggestion; this UI only ever previews
 * what that check would say, it never bypasses it.
 */
export default function MemberSuggestPanel({
  recipientUid,
  recipientName,
  onClose,
  onCreated,
}: {
  recipientUid: string;
  recipientName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<CandidateResult | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const { data, error } = useAdminQuery<CandidatesResponse>(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    const res = await adminFetch(`/api/admin/dashboard/members/${recipientUid}/suggest/candidates?${params}`);
    const body = await res.json();
    if (!res.ok || body.ok === false) {
      // recipient_not_eligible is an EXPECTED, explainable outcome (see
      // Admin Dashboard consistency audit) — folded into a normal
      // resolved result (candidates: [], notEligible: <diagnosis>) so it
      // renders as a clear explanation, not a generic fetch error like
      // every other failure here still correctly does via
      // manualSuggestionErrorLabel.
      if (body.error === "recipient_not_eligible") {
        return { candidates: [], notEligible: body.eligibility as EligibilityDiagnosis };
      }
      throw new Error(manualSuggestionErrorLabel(body.error));
    }
    return { candidates: body.candidates as CandidateResult[], notEligible: null };
  }, [recipientUid, q]);
  const candidates = data?.candidates ?? null;
  const notEligible = data?.notEligible ?? null;

  async function handleSend() {
    if (!selected) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await adminFetch(`/api/admin/dashboard/members/${recipientUid}/suggest`, {
        method: "POST",
        body: JSON.stringify({ candidateUid: selected.uid, note: note.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(manualSuggestionErrorLabel(data.error));
      onCreated();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "No se ha podido crear la sugerencia.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 px-6 py-10">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-serif text-[20px] text-ink">Sugerencia del equipo</h3>
            <p className="mt-1 text-[13px] text-ink-soft">
              Elige a quién sugerir a <span className="font-medium text-ink">{recipientName}</span>, fuera del
              proceso normal del algoritmo. No consume sus 3 selecciones mensuales.
            </p>
          </div>
          <button onClick={onClose} className="text-[13px] text-ink-soft hover:text-ink">
            Cerrar
          </button>
        </div>

        {notEligible ? (
          <div className="mt-4 rounded-xl border border-[#e3c8c8] bg-[#fbf3f3] p-4">
            <p className="text-[14px] font-medium text-[#8a3b3b]">
              {recipientName} ya no cumple los requisitos para el emparejamiento.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] text-[#8a3b3b]">
              {eligibilityReasonLines(notEligible).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-ink-soft">
              No se puede buscar ni sugerir a nadie hasta que esto se resuelva.
            </p>
          </div>
        ) : !selected ? (
          <>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre…"
              className="mt-4 w-full rounded-full border border-hairline px-4 py-2 text-[14px] focus:border-rose-dark focus:outline-none"
            />

            <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
              {error && <p className="text-[13px] text-[#8a3b3b]">{error}</p>}
              {!error && !candidates && <p className="text-[13px] text-ink-soft">Cargando…</p>}
              {!error && candidates && candidates.length === 0 && (
                <p className="text-[13px] text-ink-soft">Sin resultados.</p>
              )}
              {candidates?.map((c) => (
                <div key={c.uid} className="rounded-xl border border-hairline p-3">
                  <div className="flex items-center gap-3">
                    <PhotoThumb path={c.photoPath} alt={c.firstName} size={36} />
                    <div className="flex-1">
                      <p className="text-[14px] font-medium text-ink">
                        {c.firstName} {c.age ? `· ${c.age}` : ""} · {genderLabel(c.gender)}
                      </p>
                      <p className="text-[12px] text-ink-soft">
                        {c.city} · {c.searchStatus === "active_search" ? "Búsqueda activa" : "Pasivo/a"}
                      </p>
                    </div>
                    {c.score && <Badge tone="neutral">{c.score.score} / 100</Badge>}
                  </div>

                  {c.hardFilterFailures.length > 0 && (
                    <div className="mt-2 text-[12px] text-[#8a3b3b]">
                      <p>No compatible con los requisitos imprescindibles:</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {c.hardFilterFailures.map((f, i) => (
                          <li key={`${f.reason}-${f.direction}-${i}`}>
                            {hardFilterFailureLabel(f, recipientName, c.firstName)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {c.hardFilterFailures.length === 0 && c.pairHistoryReason && (
                    <p className="mt-2 text-[12px] text-[#8a3b3b]">
                      {PAIR_HISTORY_REASON_LABELS[c.pairHistoryReason] ?? c.pairHistoryReason}
                    </p>
                  )}
                  {c.alreadySuggested && (
                    <p className="mt-2 text-[12px] text-ink-soft">Ya se sugirió esta pareja anteriormente.</p>
                  )}

                  <button
                    disabled={!c.canSuggest}
                    onClick={() => setSelected(c)}
                    className="mt-2 rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Sugerir
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-5">
            <p className="text-[14px] text-ink">
              Vas a sugerir a <span className="font-medium">{selected.firstName}</span> para{" "}
              <span className="font-medium">{recipientName}</span>.
            </p>
            {selected.score && (
              <div className="mt-2 rounded-lg border border-hairline bg-paper p-3">
                <p className="text-[13px] font-medium text-ink">
                  Compatibilidad algorítmica: {selected.score.score} / 100
                </p>
                <p className="mt-0.5 text-[11px] text-ink-soft">
                  v{selected.score.scoringVersion} · cobertura {Math.round(selected.score.coverage * 100)}% ·
                  confianza {computeMatchWhy(selected.score).confidenceLabel.toLowerCase()}
                </p>
                <ul className="mt-2 space-y-1 text-[12px] text-ink-soft">
                  {computeMatchWhy(selected.score).lines.map((line) => (
                    <li key={line.dimension} className="flex justify-between gap-3">
                      <span>
                        {line.symbol === "check" && "✓ "}
                        {line.symbol === "warn" && "△ "}
                        {line.symbol === "cross" && "✗ "}
                        {line.symbol === "dash" && "— "}
                        {line.text}
                      </span>
                      <span className="shrink-0 text-ink-soft/80">
                        peso {line.weight}
                        {line.fit !== null ? ` · contrib. ${line.contribution.toFixed(1)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nota interna (opcional) — nunca se muestra a los miembros. Ej: 'coincidieron en un evento'."
              rows={3}
              className="mt-3 w-full rounded-lg border border-hairline px-3 py-2 text-[14px] placeholder:text-ink-soft/70 focus:border-rose-dark focus:outline-none"
            />
            {sendError && <p className="mt-2 text-[13px] text-[#8a3b3b]">{sendError}</p>}
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setSelected(null)} className="text-[13px] text-ink-soft hover:text-ink">
                Atrás
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="rounded-full bg-ink px-5 py-2 text-[13px] font-medium text-white disabled:opacity-60"
              >
                {sending ? "Enviando…" : "Confirmar sugerencia"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
