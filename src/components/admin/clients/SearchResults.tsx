"use client";

import { useMemo, useState } from "react";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { hardFilterFailureLabel } from "@/lib/admin/labels";
import type { CandidateResult, SearchResult } from "@/lib/clients/search";
import { SHORTLIST_STATUSES, type Programme } from "@/lib/clients/types";
import Badge from "@/components/admin/Badge";
import PhotoThumb from "@/components/admin/PhotoThumb";
import Reciprocity from "./Reciprocity";
import { errorText, formatDate, inputClasses, linkButton, pillButton } from "./ui";

/**
 * The ranked list behind "Buscar perfiles compatibles": every compatible
 * candidate, highest score first, with no cap and no minimum score. The
 * filters only narrow what is shown; they never change a score.
 */

type Zone = "20" | "50" | "100" | "provincia" | "comunidad" | "espana";
type Sort = "score" | "distance" | "age" | "recent";

const ZONES: { value: Zone; label: string }[] = [
  { value: "20", label: "Hasta 20 km (misma ciudad)" },
  { value: "50", label: "Hasta 50 km" },
  { value: "100", label: "Hasta 100 km" },
  { value: "provincia", label: "Su provincia" },
  { value: "comunidad", label: "Su comunidad autónoma" },
  { value: "espana", label: "Toda España" },
];

const SORTS: { value: Sort; label: string }[] = [
  { value: "score", label: "Puntuación" },
  { value: "distance", label: "Distancia" },
  { value: "age", label: "Edad" },
  { value: "recent", label: "Actualizados recientemente" },
];

/** Programa Select searches locally; Select Privado, the whole country. */
export function defaultZone(programme: Programme | null): Zone {
  return programme === "privado" ? "espana" : "50";
}

export interface Filters {
  zone: Zone;
  includeUnplaced: boolean;
  city: string;
  ageMin: string;
  ageMax: string;
  withPhotos: boolean;
  hideShortlisted: boolean;
  showIncompatible: boolean;
  sort: Sort;
}

export function initialFilters(programme: Programme | null): Filters {
  return {
    zone: defaultZone(programme),
    includeUnplaced: false,
    city: "",
    ageMin: "",
    ageMax: "",
    withPhotos: false,
    hideShortlisted: false,
    showIncompatible: false,
    sort: "score",
  };
}

function normal(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function inZone(r: CandidateResult, zone: Zone, search: SearchResult): boolean | null {
  if (zone === "espana") return true;
  if (!r.place || !search.clientPlace) return null;
  if (zone === "provincia") return r.place.province === search.clientPlace.province;
  if (zone === "comunidad") return r.place.community === search.clientPlace.community;
  return r.distanceKm !== null && r.distanceKm <= Number(zone);
}

export default function SearchResults({
  clientName,
  search,
  running,
  error,
  filters,
  onFilters,
  onRerun,
  onOpen,
  onShortlist,
}: {
  clientName: string;
  search: SearchResult | null;
  running: boolean;
  error: string | null;
  filters: Filters;
  onFilters: (f: Filters) => void;
  onRerun: () => void;
  onOpen: (uid: string) => void;
  onShortlist: (uid: string, score: number | null) => Promise<void>;
}) {
  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch });

  const view = useMemo(() => {
    if (!search) return null;
    let unplaced = 0;
    const cityKey = normal(filters.city);
    const ageMin = filters.ageMin === "" ? null : Number(filters.ageMin);
    const ageMax = filters.ageMax === "" ? null : Number(filters.ageMax);
    const shown = search.results.filter((r) => {
      if (!filters.showIncompatible && !r.compatible) return false;
      const z = inZone(r, filters.zone, search);
      if (z === null) {
        unplaced++;
        if (!filters.includeUnplaced) return false;
      } else if (!z) return false;
      if (cityKey && !normal(`${r.city} ${r.place?.name ?? ""} ${r.place?.province ?? ""}`).includes(cityKey)) return false;
      if (ageMin !== null && (r.age === null || r.age < ageMin)) return false;
      if (ageMax !== null && (r.age === null || r.age > ageMax)) return false;
      if (filters.withPhotos && r.photoCount === 0) return false;
      if (filters.hideShortlisted && r.shortlistStatus) return false;
      return true;
    });
    const byScore = (a: CandidateResult, b: CandidateResult) =>
      a.compatible !== b.compatible ? (a.compatible ? -1 : 1) : (b.score ?? -1) - (a.score ?? -1);
    const sorters: Record<Sort, (a: CandidateResult, b: CandidateResult) => number> = {
      score: byScore,
      distance: (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) || byScore(a, b),
      age: (a, b) => (a.age ?? 999) - (b.age ?? 999) || byScore(a, b),
      recent: (a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || byScore(a, b),
    };
    shown.sort(sorters[filters.sort]);
    return { shown, unplaced, compatibleShown: shown.filter((r) => r.compatible).length };
  }, [search, filters]);

  if (error) {
    return (
      <div className="rounded-2xl border border-hairline bg-white p-6 text-[14px] text-[#8a3b3b]">
        {errorText(error)}{" "}
        <button type="button" className={linkButton} onClick={onRerun}>
          Reintentar
        </button>
      </div>
    );
  }
  if (!search) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline bg-white/60 p-10 text-center">
        <p className="text-[15px] text-ink">{running ? "Buscando en toda la red…" : "Pulsa «Buscar perfiles compatibles» para ver la lista."}</p>
        <p className="mt-1 text-[13px] text-ink-soft">Solo se consulta: no se envía nada a nadie.</p>
      </div>
    );
  }
  if (search.missing.length > 0) {
    return (
      <div className="rounded-2xl border border-hairline bg-white p-6">
        <p className="text-[15px] text-ink">Para buscar falta completar en la ficha: {search.missing.join(", ")}.</p>
      </div>
    );
  }

  const needsPlace = filters.zone !== "espana" && !search.clientPlace;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-hairline bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[12px] text-ink-soft">
            Zona
            <select className={`${inputClasses} mt-1`} value={filters.zone} onChange={(e) => set({ zone: e.target.value as Zone })}>
              {ZONES.map((z) => (
                <option key={z.value} value={z.value}>{z.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-[12px] text-ink-soft">
            Ciudad o provincia
            <input className={`${inputClasses} mt-1`} value={filters.city} onChange={(e) => set({ city: e.target.value })} placeholder="Cualquiera" />
          </label>
          <label className="block text-[12px] text-ink-soft">
            Edad
            <span className="mt-1 flex items-center gap-2">
              <input className={inputClasses} inputMode="numeric" placeholder="Mín." value={filters.ageMin} onChange={(e) => set({ ageMin: e.target.value.replace(/\D/g, "") })} />
              <span>–</span>
              <input className={inputClasses} inputMode="numeric" placeholder="Máx." value={filters.ageMax} onChange={(e) => set({ ageMax: e.target.value.replace(/\D/g, "") })} />
            </span>
          </label>
          <label className="block text-[12px] text-ink-soft">
            Ordenar por
            <select className={`${inputClasses} mt-1`} value={filters.sort} onChange={(e) => set({ sort: e.target.value as Sort })}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink">
          <Check checked={filters.withPhotos} onChange={(v) => set({ withPhotos: v })} label="Solo con fotos" />
          <Check checked={filters.hideShortlisted} onChange={(v) => set({ hideShortlisted: v })} label="Ocultar preseleccionados" />
          <Check checked={filters.showIncompatible} onChange={(v) => set({ showIncompatible: v })} label="Mostrar también los no compatibles" />
          {filters.zone !== "espana" && (
            <Check checked={filters.includeUnplaced} onChange={(v) => set({ includeUnplaced: v })} label="Incluir perfiles sin ubicación confirmada" />
          )}
        </div>
      </div>

      {needsPlace && (
        <p className="rounded-xl bg-[#f6ead2] px-4 py-3 text-[13px] text-[#7a5a1e]">
          Confirma en la ficha el municipio de {clientName} para poder filtrar por distancia, o elige «Toda España».
        </p>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 text-[13px] text-ink-soft">
        <p>
          <span className="font-medium text-ink">{view!.compatibleShown}</span> compatibles en esta zona · {search.compatibleCount} en toda la red · {search.poolSize} perfiles revisados
          {view!.unplaced > 0 && !filters.includeUnplaced && ` · ${view!.unplaced} sin ubicación confirmada no se muestran`}
        </p>
        <p>
          Búsqueda de las {new Date(search.ranAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} ·{" "}
          <button type="button" className={linkButton} onClick={onRerun} disabled={running}>
            {running ? "Actualizando…" : "Actualizar"}
          </button>
        </p>
      </div>

      {view!.shown.length === 0 ? (
        <div className="rounded-2xl border border-hairline bg-white p-8 text-center text-[14px] text-ink-soft">
          Nadie cumple estos filtros. Prueba a ampliar la zona.
        </div>
      ) : (
        <ol className="space-y-3">
          {view!.shown.map((r) => (
            <ResultRow key={r.uid} r={r} clientName={clientName} onOpen={onOpen} onShortlist={onShortlist} onLocated={onRerun} />
          ))}
        </ol>
      )}
    </div>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input type="checkbox" className="h-4 w-4 accent-[#8a4b4f]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function ResultRow({
  r,
  clientName,
  onOpen,
  onShortlist,
  onLocated,
}: {
  r: CandidateResult;
  clientName: string;
  onOpen: (uid: string) => void;
  onShortlist: (uid: string, score: number | null) => Promise<void>;
  onLocated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const strengths = r.why?.lines.filter((l) => l.tier === "good").slice(0, 3) ?? [];
  const concerns = r.why?.lines.filter((l) => l.tier === "weak" || l.tier === "mismatch") ?? [];
  const unknown = r.why?.lines.filter((l) => l.tier === "not_evaluated").length ?? 0;
  const status = r.shortlistStatus ? SHORTLIST_STATUSES.find((s) => s.value === r.shortlistStatus)?.label : null;

  async function shortlist() {
    setBusy(true);
    try {
      await onShortlist(r.uid, r.score);
    } finally {
      setBusy(false);
    }
  }

  async function locate(ine: string) {
    setBusy(true);
    try {
      await adminFetchJson(`/api/admin/candidate-locations/${r.uid}`, { method: "PUT", body: JSON.stringify({ ine }) });
      onLocated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`rounded-2xl border bg-white p-4 sm:p-5 ${r.compatible ? "border-hairline" : "border-dashed border-hairline opacity-80"}`}>
      <div className="flex gap-4">
        <button type="button" onClick={() => onOpen(r.uid)} className="shrink-0" aria-label={`Ver el perfil de ${r.firstName}`}>
          <PhotoThumb path={r.photoPath} alt={r.firstName} size={72} rounded="lg" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <button type="button" onClick={() => onOpen(r.uid)} className="text-left">
                <span className="font-serif text-[20px] text-ink hover:underline">{r.firstName}</span>
                {r.age !== null && <span className="text-[16px] text-ink-soft">, {r.age}</span>}
              </button>
              <p className="text-[13px] text-ink-soft">
                {r.place ? r.place.name : r.city || "Ciudad no indicada"}
                {r.place && r.place.name !== r.place.province && ` · ${r.place.province}`}
                {r.distanceKm !== null && ` · a ${r.distanceKm} km`}
                {` · ${r.photoCount} ${r.photoCount === 1 ? "foto" : "fotos"}`}
                {r.updatedAt && ` · actualizado ${formatDate(r.updatedAt)}`}
              </p>
            </div>
            <div className="text-right">
              {r.score !== null ? (
                <p className="font-serif text-[26px] leading-none text-ink">
                  {r.score}
                  <span className="text-[14px] text-ink-soft"> /100</span>
                </p>
              ) : (
                <Badge tone="negative">No compatible</Badge>
              )}
              {r.why && <p className="mt-1 text-[11px] text-ink-soft">Datos evaluados {r.why.coveragePercent}%</p>}
            </div>
          </div>

          <div className="mt-2">
            <Reciprocity clientName={clientName} candidateName={r.firstName} clientAccepts={r.clientAcceptsCandidate} candidateAccepts={r.candidateAcceptsClient} />
          </div>

          {r.compatible ? (
            <div className="mt-2 grid gap-1 text-[13px] sm:grid-cols-2">
              <p className="text-ink">
                <span className="text-ink-soft">A favor: </span>
                {strengths.length ? strengths.map((l) => l.dimensionLabel).join(", ") : "—"}
              </p>
              <p className="text-ink">
                <span className="text-ink-soft">A tener en cuenta: </span>
                {concerns.length ? concerns.map((l) => l.dimensionLabel).join(", ") : "nada destacable"}
                {unknown > 0 && <span className="text-ink-soft"> · {unknown} {unknown === 1 ? "aspecto" : "aspectos"} sin datos</span>}
              </p>
            </div>
          ) : (
            <ul className="mt-2 space-y-0.5 text-[13px] text-[#8a3b3b]">
              {r.failures.map((f, i) => (
                <li key={i}>{hardFilterFailureLabel(f, clientName, r.firstName)}</li>
              ))}
            </ul>
          )}

          {(r.location === "ambiguous" || r.location === "unknown") && (
            <div className="mt-3 rounded-lg bg-[#f6ead2] px-3 py-2 text-[12px] text-[#7a5a1e]">
              {r.location === "ambiguous" ? `«${r.city}» puede ser varios municipios. ¿Cuál es?` : `No reconocemos «${r.city}» como municipio.`}
              {r.locationOptions.length > 0 && (
                <span className="ml-2 inline-flex flex-wrap gap-1.5">
                  {r.locationOptions.slice(0, 8).map((o) => (
                    <button
                      key={o.ine}
                      type="button"
                      disabled={busy}
                      onClick={() => void locate(o.ine)}
                      className="rounded-full border border-[#d9c39a] bg-white px-2 py-0.5 text-[12px] text-ink hover:border-ink"
                    >
                      {o.name} · {o.province}
                    </button>
                  ))}
                </span>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {status ? (
              <Badge tone="positive">✓ {status}</Badge>
            ) : (
              <button type="button" className={pillButton} disabled={busy} onClick={() => void shortlist()}>
                Preseleccionar
              </button>
            )}
            <button type="button" className={linkButton} onClick={() => onOpen(r.uid)}>
              Ver perfil completo
            </button>
            {r.type === "cliente" && <Badge tone="neutral">Cliente</Badge>}
            {r.location === "confirmed" && <Badge tone="muted">Ubicación confirmada por el equipo</Badge>}
            {r.otherClients.length > 0 && (
              <Badge tone="warning">También en la preselección de {r.otherClients.map((o) => o.name).join(", ")}</Badge>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
