"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import { AdminEmpty, AdminError, AdminLoading } from "@/components/admin/States";
import Badge from "@/components/admin/Badge";
import PhotoThumb from "@/components/admin/PhotoThumb";

interface ProposalSummary {
  id: string;
  recipient: { uid: string | null; firstName: string; photoPath: string | null };
  candidate: { uid: string | null; firstName: string; photoPath: string | null };
  score: number;
  cycleId: string;
  source: string;
  stage: string;
  invitationStage: string | null;
  mutual: boolean;
  introduced: boolean;
  createdAt: string | null;
}

const FILTERS = [
  { value: "all", label: "Todas" },
  { value: "current_cycle", label: "Ciclo actual" },
  { value: "pending", label: "Pendientes" },
  { value: "member_interested", label: "Interés del miembro" },
  { value: "member_passed", label: "Pasó el miembro" },
  { value: "invitation_sent", label: "Invitación enviada" },
  { value: "candidate_interested", label: "Interés del candidato" },
  { value: "candidate_passed", label: "Pasó el candidato" },
  { value: "mutual", label: "Mutuo" },
  { value: "introduced", label: "Introducidas" },
];

const STAGE_LABELS: Record<string, string> = {
  proposed: "Pendiente",
  viewed: "Vista",
  member_interested: "Le interesó al miembro",
  member_passed: "Pasó el miembro",
  mutual_interested: "Mutuo",
  expired: "Expiró",
};

export default function ProposalsListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filter = searchParams.get("filter") ?? "all";
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

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
    return adminFetchJson<{ items: ProposalSummary[]; total: number }>(`/api/admin/dashboard/proposals?${params}`);
  }, [filter, q, effectivePage]);
  const items = data?.items ?? null;
  const total = data?.total ?? 0;

  function setFilter(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("filter", next);
    router.push(`/admin/proposals?${params}`);
  }

  return (
    <div className="max-w-6xl">
      <h1 className="font-serif text-[26px] text-ink">Propuestas</h1>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre…"
        className="mt-6 w-64 rounded-full border border-hairline px-4 py-2 text-[14px] placeholder:text-ink-soft/70 focus:border-rose-dark focus:outline-none"
      />

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
        {!error && items && items.length === 0 && <AdminEmpty message="No hay propuestas que coincidan con este filtro." />}
        {!error && items && items.length > 0 && (
          <div className="space-y-2">
            {items.map((p) => (
              <Link
                key={p.id}
                href={`/admin/proposals/${p.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-white px-4 py-3 hover:border-rose"
              >
                <div className="flex items-center gap-3">
                  <PhotoThumb path={p.recipient.photoPath} alt={p.recipient.firstName} size={32} />
                  <span className="text-[14px] text-ink">{p.recipient.firstName}</span>
                  <span className="text-ink-soft">→</span>
                  <PhotoThumb path={p.candidate.photoPath} alt={p.candidate.firstName} size={32} />
                  <span className="text-[14px] text-ink">{p.candidate.firstName}</span>
                </div>
                <div className="flex items-center gap-2">
                  {p.source === "admin_manual" && <Badge tone="neutral">Sugerencia del equipo</Badge>}
                  {p.introduced && <Badge tone="positive">Introducción</Badge>}
                  <Badge tone="muted">{STAGE_LABELS[p.stage] ?? p.stage}</Badge>
                  <Badge tone="muted">{p.score}/100</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}

        {items && total > pageSize && (
          <div className="mt-4 flex items-center justify-between text-[13px] text-ink-soft">
            <span>
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
            </span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-full border border-hairline px-3 py-1 disabled:opacity-40">
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
