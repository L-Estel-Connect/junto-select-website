"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { AdminEmpty, AdminError, AdminLoading } from "@/components/admin/States";
import Badge from "@/components/admin/Badge";

interface CycleSummary {
  id: string;
  mode: string;
  status: string;
  recipients: number;
  processed: number;
  counts: { zero: number; one: number; two: number; three: number };
  totalSelections: number;
  errors: number;
}

interface ScanSummary {
  id: string;
  ranAt: string | null;
  membersDue: number;
  membersAdvanced: number;
  membersRetryPending: number;
  proposalsCreated: number;
  membersWithZeroProposals: number;
  errors: number;
}

const STATUS_TONE: Record<string, "positive" | "warning" | "negative" | "muted"> = {
  completed: "positive",
  running: "warning",
  pending: "muted",
  failed: "negative",
};

function formatRanAt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

export default function MatchingCyclesPage() {
  const [items, setItems] = useState<CycleSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scans, setScans] = useState<ScanSummary[] | null>(null);
  const [scansError, setScansError] = useState<string | null>(null);

  useEffect(() => {
    adminFetchJson<{ items: CycleSummary[] }>("/api/admin/dashboard/matching/cycles")
      .then((res) => setItems(res.items))
      .catch((e) => setError(e.message));
    adminFetchJson<{ items: ScanSummary[] }>("/api/admin/dashboard/matching/scans")
      .then((res) => setScans(res.items))
      .catch((e) => setScansError(e.message));
  }, []);

  return (
    <div className="max-w-5xl">
      <h1 className="font-serif text-[26px] text-ink">Ciclos de matching</h1>

      <h2 className="mt-10 font-serif text-[19px] text-ink">
        Escaneos automáticos (matching por aniversario de membresía)
      </h2>
      <p className="mt-1 max-w-[70ch] text-[13px] text-ink-soft">
        Cada fila es una ejecución del escáner automático que busca miembros con un periodo de matching
        pendiente (según su propia fecha de inicio de membresía, no el día 1 de mes). Si esta tabla lleva
        mucho tiempo sin una fila nueva, el programador automático (Cloud Scheduler) probablemente no está
        configurado o no se está ejecutando.
      </p>
      <div className="mt-4">
        {scansError && <AdminError message={scansError} />}
        {!scansError && !scans && <AdminLoading />}
        {!scansError && scans && scans.length === 0 && (
          <AdminEmpty message="Todavía no se ha ejecutado ningún escaneo automático." />
        )}
        {!scansError && scans && scans.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-hairline bg-white">
            <table className="w-full text-left text-[14px]">
              <thead className="border-b border-hairline text-[12px] uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha/hora</th>
                  <th className="px-4 py-3 font-medium">Pendientes</th>
                  <th className="px-4 py-3 font-medium">Procesados</th>
                  <th className="px-4 py-3 font-medium">Reintento pendiente</th>
                  <th className="px-4 py-3 font-medium">Selecciones creadas</th>
                  <th className="px-4 py-3 font-medium">Sin selecciones</th>
                  <th className="px-4 py-3 font-medium">Errores</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s) => (
                  <tr key={s.id} className="border-b border-hairline/70 last:border-0">
                    <td className="px-4 py-3 text-ink">{formatRanAt(s.ranAt)}</td>
                    <td className="px-4 py-3 text-ink-soft">{s.membersDue}</td>
                    <td className="px-4 py-3 text-ink-soft">{s.membersAdvanced}</td>
                    <td className="px-4 py-3 text-ink-soft">{s.membersRetryPending}</td>
                    <td className="px-4 py-3 text-ink-soft">{s.proposalsCreated}</td>
                    <td className="px-4 py-3 text-ink-soft">{s.membersWithZeroProposals}</td>
                    <td className="px-4 py-3">
                      {s.errors > 0 ? <Badge tone="negative">{s.errors}</Badge> : <span className="text-ink-soft">0</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="mt-10 font-serif text-[19px] text-ink">Ciclos manuales/administrativos</h2>
      <div className="mt-4">
        {error && <AdminError message={error} />}
        {!error && !items && <AdminLoading />}
        {!error && items && items.length === 0 && <AdminEmpty message="Todavía no se ha ejecutado ningún ciclo." />}
        {!error && items && items.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-hairline bg-white">
            <table className="w-full text-left text-[14px]">
              <thead className="border-b border-hairline text-[12px] uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Ciclo</th>
                  <th className="px-4 py-3 font-medium">Modo</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Procesados</th>
                  <th className="px-4 py-3 font-medium">0</th>
                  <th className="px-4 py-3 font-medium">1</th>
                  <th className="px-4 py-3 font-medium">2</th>
                  <th className="px-4 py-3 font-medium">3</th>
                  <th className="px-4 py-3 font-medium">Total selecciones</th>
                  <th className="px-4 py-3 font-medium">Errores</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b border-hairline/70 last:border-0 hover:bg-rose-tint/30">
                    <td className="px-4 py-3">
                      <Link href={`/admin/matching/${c.id}`} className="font-medium text-ink hover:underline">
                        {c.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{c.mode}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[c.status] ?? "muted"}>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {c.processed} / {c.recipients}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{c.counts.zero}</td>
                    <td className="px-4 py-3 text-ink-soft">{c.counts.one}</td>
                    <td className="px-4 py-3 text-ink-soft">{c.counts.two}</td>
                    <td className="px-4 py-3 text-ink-soft">{c.counts.three}</td>
                    <td className="px-4 py-3 text-ink-soft">{c.totalSelections}</td>
                    <td className="px-4 py-3">
                      {c.errors > 0 ? <Badge tone="negative">{c.errors}</Badge> : <span className="text-ink-soft">0</span>}
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
