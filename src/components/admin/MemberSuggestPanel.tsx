"use client";

import { useState } from "react";
import { adminFetch, adminFetchJson } from "@/lib/admin/adminFetch";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import PhotoThumb from "./PhotoThumb";
import Badge from "./Badge";
import { genderLabel, hardFilterFailureLabel, manualSuggestionErrorLabel, PAIR_HISTORY_REASON_LABELS } from "@/lib/admin/labels";

interface HardFilterFailure {
  reason: string;
  direction: "a_rejects_b" | "b_rejects_a";
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
  score: { score: number } | null;
  canSuggest: boolean;
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

  const { data, error } = useAdminQuery(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    return adminFetchJson<{ candidates: CandidateResult[] }>(
      `/api/admin/dashboard/members/${recipientUid}/suggest/candidates?${params}`,
    );
  }, [recipientUid, q]);
  const candidates = data?.candidates ?? null;

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

        {!selected ? (
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
            {selected.score && <p className="mt-1 text-[13px] text-ink-soft">Compatibilidad algorítmica: {selected.score.score} / 100</p>}
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
