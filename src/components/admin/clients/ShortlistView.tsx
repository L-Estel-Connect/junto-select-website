"use client";

import { useState } from "react";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { COUNTS_AS_PROPOSAL, SHORTLIST_STATUSES, type ShortlistEntryView, type ShortlistStatus } from "@/lib/clients/types";
import PhotoThumb from "@/components/admin/PhotoThumb";
import { errorText, formatDate, inputClasses, linkButton } from "./ui";

/**
 * The client's preselection: the people the team picked by hand, where
 * each one stands, and private notes. Marking someone "Presentado" counts
 * against the programme's introductions. Changing a status here only
 * records it; nobody is contacted.
 */
export default function ShortlistView({
  clientId,
  entries,
  limit,
  onChanged,
  onOpen,
}: {
  clientId: string;
  entries: ShortlistEntryView[];
  limit: number | null;
  onChanged: () => void;
  onOpen: (uid: string) => void;
}) {
  const presented = entries.filter((e) => COUNTS_AS_PROPOSAL.includes(e.status)).length;

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline bg-white/60 p-10 text-center">
        <p className="text-[15px] text-ink">Todavía no hay nadie preseleccionado.</p>
        <p className="mt-1 text-[13px] text-ink-soft">Busca perfiles compatibles y pulsa «Preseleccionar» en los que te interesen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {limit !== null && presented > limit && (
        <p className="rounded-xl bg-[#f6ead2] px-4 py-3 text-[13px] text-[#7a5a1e]">
          Ya hay {presented} presentaciones y el programa incluye {limit}.
        </p>
      )}
      <ol className="space-y-3">
        {entries.map((e) => (
          <Entry key={e.id} clientId={clientId} entry={e} onChanged={onChanged} onOpen={onOpen} />
        ))}
      </ol>
    </div>
  );
}

function Entry({
  clientId,
  entry,
  onChanged,
  onOpen,
}: {
  clientId: string;
  entry: ShortlistEntryView;
  onChanged: () => void;
  onOpen: (uid: string) => void;
}) {
  const [note, setNote] = useState(entry.note);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const url = `/api/admin/clients/${clientId}/shortlist/${entry.id}`;

  async function patch(body: { status?: ShortlistStatus; note?: string }) {
    setError(null);
    try {
      await adminFetchJson(url, { method: "PATCH", body: JSON.stringify(body) });
      if (body.note !== undefined) setSaved(true);
      if (body.status !== undefined) onChanged();
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : null));
    }
  }

  async function remove() {
    if (!window.confirm("¿Quitar a esta persona de la preselección?")) return;
    try {
      await adminFetchJson(url, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : null));
    }
  }

  const c = entry.candidate;
  return (
    <li className="rounded-2xl border border-hairline bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-4">
        {c ? (
          <button type="button" onClick={() => entry.candidateUid && onOpen(entry.candidateUid)} className="shrink-0">
            <PhotoThumb path={c.photoPath} alt={c.firstName} size={56} rounded="lg" />
          </button>
        ) : (
          <PhotoThumb path={null} alt="—" size={56} rounded="lg" />
        )}
        <div className="min-w-0 flex-1">
          {c ? (
            <button type="button" onClick={() => entry.candidateUid && onOpen(entry.candidateUid)} className="text-left">
              <span className="font-serif text-[19px] text-ink hover:underline">{c.firstName}</span>
              {c.age !== null && <span className="text-ink-soft">, {c.age}</span>}
              <span className="block text-[13px] text-ink-soft">{c.city || "Ciudad no indicada"}</span>
            </button>
          ) : (
            <p className="text-[14px] text-ink-soft">Perfil eliminado por la persona después de la presentación.</p>
          )}
          <p className="mt-1 text-[12px] text-ink-soft">
            Añadido el {formatDate(entry.createdAt)}
            {entry.scoreWhenAdded !== null && ` · puntuación al añadirlo: ${entry.scoreWhenAdded}/100`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            aria-label="Estado"
            className={`${inputClasses} w-auto`}
            value={entry.status}
            disabled={!c}
            onChange={(ev) => void patch({ status: ev.target.value as ShortlistStatus })}
          >
            {SHORTLIST_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {c && (
            <button type="button" className={linkButton} onClick={() => void remove()}>
              Quitar
            </button>
          )}
        </div>
      </div>
      {c && (
        <div className="mt-3">
          <textarea
            rows={2}
            className={inputClasses}
            placeholder="Notas privadas sobre esta propuesta"
            value={note}
            onChange={(ev) => {
              setNote(ev.target.value);
              setSaved(false);
            }}
            onBlur={() => note !== entry.note && void patch({ note })}
          />
          {saved && <p className="mt-1 text-[12px] text-ink-soft">Nota guardada</p>}
        </div>
      )}
      {error && <p className="mt-2 text-[13px] text-[#8a3b3b]">{error}</p>}
    </li>
  );
}
