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

const STATUS_TONE: Record<string, "positive" | "warning" | "negative" | "muted"> = {
  completed: "positive",
  running: "warning",
  pending: "muted",
  failed: "negative",
};

export default function MatchingCyclesPage() {
  const [items, setItems] = useState<CycleSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetchJson<{ items: CycleSummary[] }>("/api/admin/dashboard/matching/cycles")
      .then((res) => setItems(res.items))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="max-w-5xl">
      <h1 className="font-serif text-[26px] text-ink">Ciclos de matching</h1>

      <div className="mt-6">
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
