"use client";

import { useEffect, useState } from "react";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import type { PlaceSummary } from "@/lib/clients/search";
import { Field, inputClasses, linkButton } from "./ui";

/**
 * The client's city, written freely, plus the municipality it stands for.
 * Common names ("Madrid", "Pozuelo", "Alicante") are placed by the server
 * on their own; when a name could be several towns, or isn't recognised,
 * the matching municipalities are offered here to pick from.
 */
export default function PlaceField({
  city,
  placeIne,
  onChange,
}: {
  city: string;
  placeIne: string | null;
  onChange: (city: string, placeIne: string | null) => void;
}) {
  const [place, setPlace] = useState<PlaceSummary | null>(null);
  const [options, setOptions] = useState<PlaceSummary[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const request = placeIne
      ? adminFetchJson<{ places: PlaceSummary[] }>(`/api/admin/places?ine=${encodeURIComponent(placeIne)}`)
      : Promise.resolve({ places: [] as PlaceSummary[] });
    request
      .then((r) => !cancelled && setPlace(r.places[0] ?? null))
      .catch(() => !cancelled && setPlace(null));
    return () => {
      cancelled = true;
    };
  }, [placeIne]);

  const searchText = choosing ? query : placeIne ? "" : city;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const request =
        searchText.trim().length >= 2
          ? adminFetchJson<{ places: PlaceSummary[] }>(`/api/admin/places?q=${encodeURIComponent(searchText)}`)
          : Promise.resolve({ places: [] as PlaceSummary[] });
      request.then((r) => !cancelled && setOptions(r.places)).catch(() => !cancelled && setOptions([]));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchText]);

  function choose(p: PlaceSummary) {
    setChoosing(false);
    setQuery("");
    onChange(city.trim() ? city : p.name, p.ine);
  }

  const unresolved = !placeIne && city.trim().length > 0;

  return (
    <div>
      <Field label="Ciudad">
        <input className={inputClasses} value={city} onChange={(e) => onChange(e.target.value, null)} placeholder="Ej.: Madrid, Pozuelo, Valencia…" />
      </Field>

      <div className="mt-2 text-[13px]">
        {placeIne && place && !choosing && (
          <p className="text-ink-soft">
            <span className="text-[#3a5a37]">✓</span> Municipio: <span className="text-ink">{place.name}</span> · {place.province}
            <button type="button" className={`${linkButton} ml-3`} onClick={() => setChoosing(true)}>
              Cambiar
            </button>
          </p>
        )}
        {choosing && (
          <div className="mt-1 max-w-[440px]">
            <input
              autoFocus
              className={inputClasses}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busca el municipio"
            />
          </div>
        )}
        {unresolved && !choosing && (
          <p className="text-[#7a5a1e]">
            No sabemos con seguridad qué municipio es{options.length > 0 ? ". Elige el correcto:" : ". Prueba con otro nombre."}
          </p>
        )}
        {(choosing || unresolved) && options.length > 0 && (
          <ul className="mt-2 flex max-w-[640px] flex-wrap gap-2">
            {options.map((o) => (
              <li key={o.ine}>
                <button
                  type="button"
                  onClick={() => choose(o)}
                  className="rounded-full border border-hairline px-3 py-1.5 text-[13px] text-ink hover:border-rose-dark"
                >
                  {o.name} <span className="text-ink-soft">· {o.province}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {choosing && (
          <button type="button" className={`${linkButton} mt-2`} onClick={() => setChoosing(false)}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
