"use client";

import { useState } from "react";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import { AdminError, AdminLoading } from "@/components/admin/States";
import Badge from "@/components/admin/Badge";
import type { LegacyImportRow } from "@/lib/admin/legacyImports";

type Filter = "all" | "imported" | "email_queued" | "claimed" | "activated" | "collision";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "imported", label: "Importado" },
  { value: "email_queued", label: "Email enviado" },
  { value: "claimed", label: "Reclamado" },
  { value: "activated", label: "Activado" },
  { value: "collision", label: "Colisión con cuenta existente" },
];

const STATUS_BADGE: Record<string, { label: string; tone: "neutral" | "positive" | "warning" | "negative" | "muted" }> = {
  imported: { label: "Importado", tone: "muted" },
  email_queued: { label: "Email en cola", tone: "neutral" },
  claimed: { label: "Reclamado", tone: "warning" },
  activated: { label: "Activado", tone: "positive" },
  collision: { label: "Colisión", tone: "negative" },
};

/**
 * Admin visibility for Path B legacy contacts — deliberately a plain list,
 * not a CRM: name, contact identifier, import/claim/activation status,
 * and parsing warnings. See legacyImports.ts's `listLegacyImports` for
 * why `displayStatus` (not the raw stored `status`) is what's shown —
 * "activated" is always recomputed from the live profile, never trusted
 * as a stale stored flag.
 */
export default function AdminLegacyPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, error } = useAdminQuery(
    () => adminFetchJson<{ items: LegacyImportRow[]; total: number }>("/api/admin/dashboard/legacy"),
    [],
  );

  if (error) return <AdminError message={error} />;
  if (!data) return <AdminLoading />;

  const items = filter === "all" ? data.items : data.items.filter((i) => i.displayStatus === filter);

  return (
    <div>
      <h1 className="font-serif text-[24px] text-ink">Contactos importados (legacy)</h1>
      <p className="mt-2 max-w-[70ch] text-[13px] text-ink-soft">
        Personas importadas desde el formulario anterior de Junto Select. No son miembros activos, no
        aparecen en la bolsa de emparejamiento y no reciben propuestas hasta que reclaman y completan su
        perfil.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors ${
              filter === f.value ? "border-ink bg-ink text-white" : "border-hairline text-ink-soft hover:border-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-hairline bg-white">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-hairline text-[11px] uppercase tracking-[0.08em] text-ink-soft">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Avisos</th>
              <th className="px-4 py-3">Importado</th>
              <th className="px-4 py-3">Email enviado</th>
              <th className="px-4 py-3">Reclamado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const badge = STATUS_BADGE[item.displayStatus] ?? { label: item.displayStatus, tone: "muted" as const };
              return (
                <tr key={item.id} className="border-b border-hairline last:border-b-0">
                  <td className="px-4 py-3 text-ink">{item.firstName ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">{item.normalizedEmail}</td>
                  <td className="px-4 py-3">
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{item.warningsCount > 0 ? item.warningsCount : "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">{item.importedAt ? item.importedAt.slice(0, 10) : "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">{item.emailQueuedAt ? item.emailQueuedAt.slice(0, 10) : "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">{item.claimedAt ? item.claimedAt.slice(0, 10) : "—"}</td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-soft">
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
