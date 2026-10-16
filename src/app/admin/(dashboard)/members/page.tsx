"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import { AdminEmpty, AdminError, AdminLoading } from "@/components/admin/States";
import Badge from "@/components/admin/Badge";
import PhotoThumb from "@/components/admin/PhotoThumb";
import { genderLabel } from "@/lib/admin/labels";
import type { CandidateRow } from "@/app/api/admin/candidates/route";

type Gender = "todos" | "hombre" | "mujer";

function normal(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/**
 * Candidatos: everyone the team can propose. Private profiles (free) and
 * clients, who can be proposed to other clients too. A complete profile
 * is a candidate without any payment. Filters combine.
 */
export default function CandidatesPage() {
  const [gender, setGender] = useState<Gender>("todos");
  const [city, setCity] = useState("");
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const { data, error } = useAdminQuery(() => adminFetchJson<{ items: CandidateRow[] }>("/api/admin/candidates"), []);

  const rows = useMemo(() => {
    const key = normal(city);
    return (data?.items ?? []).filter(
      (r) =>
        (gender === "todos" || r.gender === gender) &&
        (!key || normal(r.city).includes(key)) &&
        (!incompleteOnly || !r.complete),
    );
  }, [data, gender, city, incompleteOnly]);

  if (error) return <AdminError message={error} />;
  if (!data) return <AdminLoading />;
  const total = data.items.length;
  const complete = data.items.filter((r) => r.complete).length;

  return (
    <div className="max-w-6xl">
      <h1 className="font-serif text-[30px] text-ink">Candidatos</h1>
      <p className="mt-2 text-[13px] text-ink-soft">
        {total} personas · {complete} con el perfil completo, que pueden proponerse a clientes.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-full border border-hairline bg-white" role="group" aria-label="Género">
          {(
            [
              ["todos", "Todos"],
              ["hombre", "Hombres"],
              ["mujer", "Mujeres"],
            ] as [Gender, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={gender === value}
              onClick={() => setGender(value)}
              className={`px-4 py-2 text-[13px] font-medium transition-colors ${
                gender === value ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Ciudad"
          aria-label="Ciudad"
          className="w-48 rounded-full border border-hairline bg-white px-4 py-2 text-[13px] text-ink placeholder:text-ink-soft/70 focus:border-rose-dark focus:outline-none"
        />
        <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" className="h-4 w-4 accent-[#8a4b4f]" checked={incompleteOnly} onChange={(e) => setIncompleteOnly(e.target.checked)} />
          Perfiles incompletos
        </label>
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <AdminEmpty message="Nadie coincide con estos filtros." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-hairline bg-white">
            <table className="w-full min-w-[720px] text-left text-[14px]">
              <thead className="border-b border-hairline text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Edad</th>
                  <th className="px-4 py-3 font-medium">Género</th>
                  <th className="px-4 py-3 font-medium">Ciudad</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Perfil</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-hairline/70 last:border-0 hover:bg-rose-tint/30">
                    <td className="px-4 py-3">
                      <Link href={r.href} className="flex items-center gap-3">
                        <PhotoThumb path={r.photoPath} alt={r.firstName} />
                        <span className="font-medium text-ink">{r.firstName}</span>
                        {r.suspectedDuplicate && <Badge tone="warning">Posible duplicado</Badge>}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{r.age ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-soft">{r.gender ? genderLabel(r.gender) : "—"}</td>
                    <td className="px-4 py-3 text-ink-soft">{r.city || "—"}</td>
                    <td className="px-4 py-3 text-ink">{r.type === "cliente" ? "Cliente" : "Perfil privado"}</td>
                    <td className="px-4 py-3">
                      {r.complete ? (
                        <Badge tone="positive">Completo</Badge>
                      ) : (
                        <span className="text-[13px] text-ink-soft">Falta: {r.missing.join(", ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
