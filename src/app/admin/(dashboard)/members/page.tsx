"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import { AdminEmpty, AdminError, AdminLoading } from "@/components/admin/States";
import Badge from "@/components/admin/Badge";
import PhotoThumb from "@/components/admin/PhotoThumb";
import { genderLabel, ELIGIBILITY_REASON_LABELS } from "@/lib/admin/labels";
import type { MemberFilter } from "@/app/api/admin/dashboard/members/route";

interface MemberSummary {
  uid: string;
  personId: string;
  firstName: string;
  age: number | null;
  gender: string | null;
  city: string;
  photoPath: string | null;
  profileStatus: string;
  searchStatus: string;
  eligibleForMatching: boolean;
  ineligibleReason: string | null;
  duplicateStatus: string;
  suspectedDuplicate: boolean;
  createdAt: string | null;
}

const FILTERS: { value: MemberFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "active_search", label: "Búsqueda activa" },
  { value: "passive", label: "Pasivos" },
  { value: "eligible", label: "Elegibles" },
  { value: "ineligible", label: "No elegibles" },
  { value: "incomplete", label: "Incompletos" },
  { value: "sel0", label: "0 selecciones" },
  { value: "sel1", label: "1 selección" },
  { value: "sel2", label: "2 selecciones" },
  { value: "sel3", label: "3 selecciones" },
  { value: "dup_suspected", label: "Posible duplicado" },
  { value: "dup_confirmed", label: "Duplicado confirmado" },
];

export default function MembersListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filter = (searchParams.get("filter") as MemberFilter) || "all";
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Reset to page 1 whenever the filter/search changes — adjusted during
  // render (React's documented pattern for this), not in an effect, so it
  // never causes an extra commit.
  const [lastQueryKey, setLastQueryKey] = useState(`${filter}|${q}`);
  const queryKey = `${filter}|${q}`;
  if (queryKey !== lastQueryKey) {
    setLastQueryKey(queryKey);
    setPage(1);
  }
  const effectivePage = queryKey !== lastQueryKey ? 1 : page;

  const { data, error } = useAdminQuery(() => {
    const params = new URLSearchParams({ filter, page: String(effectivePage), pageSize: String(pageSize) });
    if (q.trim()) params.set("q", q.trim());
    return adminFetchJson<{ items: MemberSummary[]; total: number }>(`/api/admin/dashboard/members?${params}`);
  }, [filter, q, effectivePage]);
  const items = data?.items ?? null;
  const total = data?.total ?? 0;

  function setFilter(next: MemberFilter) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("filter", next);
    router.push(`/admin/members?${params}`);
  }

  return (
    <div className="max-w-6xl">
      <h1 className="font-serif text-[26px] text-ink">Miembros</h1>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o ciudad…"
          className="w-64 rounded-full border border-hairline px-4 py-2 text-[14px] text-ink placeholder:text-ink-soft/70 focus:border-rose-dark focus:outline-none"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              filter === f.value ? "bg-ink text-white" : "bg-rose-tint text-ink-soft hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {error && <AdminError message={error} />}
        {!error && !items && <AdminLoading />}
        {!error && items && items.length === 0 && <AdminEmpty message="No hay miembros que coincidan con este filtro." />}
        {!error && items && items.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-hairline bg-white">
            <table className="w-full text-left text-[14px]">
              <thead className="border-b border-hairline text-[12px] uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Miembro</th>
                  <th className="px-4 py-3 font-medium">Edad</th>
                  <th className="px-4 py-3 font-medium">Género</th>
                  <th className="px-4 py-3 font-medium">Ciudad</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Elegible</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.uid} className="border-b border-hairline/70 last:border-0 hover:bg-rose-tint/30">
                    <td className="px-4 py-3">
                      <Link href={`/admin/members/${m.uid}`} className="flex items-center gap-3">
                        <PhotoThumb path={m.photoPath} alt={m.firstName} />
                        <span className="font-medium text-ink">{m.firstName}</span>
                        {m.suspectedDuplicate && <Badge tone="warning">Posible duplicado</Badge>}
                        {m.duplicateStatus === "confirmed_duplicate" && <Badge tone="negative">Duplicado</Badge>}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{m.age ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-soft">{genderLabel(m.gender)}</td>
                    <td className="px-4 py-3 text-ink-soft">{m.city || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={m.searchStatus === "active_search" ? "positive" : "muted"}>
                        {m.searchStatus === "active_search" ? "Búsqueda activa" : "Pasivo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={m.eligibleForMatching ? "positive" : "muted"}>
                        {m.eligibleForMatching ? "Elegible" : "No elegible"}
                      </Badge>
                      {!m.eligibleForMatching && m.ineligibleReason && (
                        <p className="mt-1 max-w-[220px] text-[12px] leading-snug text-ink-soft">
                          {ELIGIBILITY_REASON_LABELS[m.ineligibleReason] ?? m.ineligibleReason}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {items && total > pageSize && (
          <div className="mt-4 flex items-center justify-between text-[13px] text-ink-soft">
            <span>
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-full border border-hairline px-3 py-1 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                disabled={page * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-full border border-hairline px-3 py-1 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
