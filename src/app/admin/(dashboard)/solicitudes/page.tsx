"use client";

import { useState } from "react";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import { AdminError, AdminLoading } from "@/components/admin/States";
import Badge from "@/components/admin/Badge";
import type { InquiryRow } from "@/lib/admin/inquiries";
import {
  CHANNEL_OPTIONS,
  INQUIRY_STATUSES,
  OBJECTIVE_OPTIONS,
  PROGRAMME_OPTIONS,
  labelOf,
  type InquiryStatus,
} from "@/lib/matchmaking/inquiry";

const TONE: Record<InquiryStatus, "neutral" | "positive" | "warning" | "negative" | "muted"> = {
  nueva: "warning",
  contactada: "neutral",
  entrevista: "neutral",
  propuesta: "neutral",
  cliente: "positive",
  espera: "muted",
  descartada: "muted",
};

const OPEN: InquiryStatus[] = ["nueva", "contactada", "entrevista", "propuesta"];

/**
 * Matchmaking applications from /matchmaking: a plain list with a status
 * and an internal note per request. Deliberately not a CRM; the client
 * pipeline proposed for Phase 2 would replace it.
 */
export default function AdminInquiriesPage() {
  const [filter, setFilter] = useState<"abiertas" | "todas" | InquiryStatus>("abiertas");
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, error, reload } = useAdminQuery(
    () => adminFetchJson<{ items: InquiryRow[] }>("/api/admin/dashboard/inquiries"),
    [],
  );

  if (error) return <AdminError message={error} />;
  if (!data) return <AdminLoading />;

  const items = data.items.filter((i) =>
    filter === "todas" ? true : filter === "abiertas" ? OPEN.includes(i.status) : i.status === filter,
  );
  const count = (s: InquiryStatus) => data.items.filter((i) => i.status === s).length;

  return (
    <div>
      <h1 className="font-serif text-[24px] text-ink">Solicitudes de matchmaking</h1>
      <p className="mt-2 max-w-[70ch] text-[13px] text-ink-soft">
        Peticiones de entrevista privada enviadas desde la página Matchmaking. Cada solicitud avisa por email a
        Junto Select. No crean cuenta, perfil ni pago.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {[
          { value: "abiertas" as const, label: `Abiertas (${OPEN.reduce((n, s) => n + count(s), 0)})` },
          { value: "todas" as const, label: `Todas (${data.items.length})` },
          ...INQUIRY_STATUSES.map((s) => ({ value: s.value, label: `${s.label} (${count(s.value)})` })),
        ].map((f) => (
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
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-hairline text-[11px] uppercase tracking-[0.08em] text-ink-soft">
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Programa</th>
              <th className="px-4 py-3">Edad · Ciudad</th>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <InquiryRowView
                key={i.id}
                item={i}
                open={openId === i.id}
                onToggle={() => setOpenId(openId === i.id ? null : i.id)}
                onSaved={reload}
              />
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-soft">
                  Sin solicitudes en esta vista.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InquiryRowView({
  item,
  open,
  onToggle,
  onSaved,
}: {
  item: InquiryRow;
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState(item.note);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save(patch: { status?: InquiryStatus; note?: string }) {
    setSaving(true);
    setSaveError(null);
    try {
      await adminFetchJson(`/api/admin/dashboard/inquiries/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      onSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "No se ha podido guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <tr className="border-b border-hairline align-top">
        <td className="px-4 py-3 text-ink-soft">{item.createdAt ? item.createdAt.slice(0, 10) : "—"}</td>
        <td className="px-4 py-3">
          <button type="button" onClick={onToggle} className="text-left text-ink underline decoration-hairline underline-offset-4">
            {item.nombre} {item.apellidos}
          </button>
        </td>
        <td className="px-4 py-3 text-ink">{labelOf(PROGRAMME_OPTIONS, item.programa)}</td>
        <td className="px-4 py-3 text-ink-soft">
          {item.edad ?? "—"} · {item.ciudad}
        </td>
        <td className="px-4 py-3 text-ink-soft">
          <div className="break-all">{item.email}</div>
          <div>
            {item.telefono} · {labelOf(CHANNEL_OPTIONS, item.canal)}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col items-start gap-2">
            <Badge tone={TONE[item.status] ?? "muted"}>{labelOf(INQUIRY_STATUSES, item.status)}</Badge>
            <select
              aria-label={`Estado de ${item.nombre}`}
              value={item.status}
              disabled={saving}
              onChange={(e) => void save({ status: e.target.value as InquiryStatus })}
              className="rounded border border-hairline bg-white px-2 py-1 text-[12px]"
            >
              {INQUIRY_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-hairline bg-[#faf7f2]">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1 text-[13px] text-ink">
                <p>
                  <span className="text-ink-soft">Busca:</span> {labelOf(OBJECTIVE_OPTIONS, item.objetivo)}, entre{" "}
                  {item.edadDesde ?? "?"} y {item.edadHasta ?? "?"} años
                </p>
                {item.busca && (
                  <p className="whitespace-pre-wrap">
                    <span className="text-ink-soft">En sus palabras:</span> {item.busca}
                  </p>
                )}
                {item.statusUpdatedBy && <p className="text-ink-soft">Último cambio de estado: {item.statusUpdatedBy}</p>}
                {item.notificationQueueError && (
                  <p className="text-[#8a3b3b]">El aviso por email no se pudo poner en cola: {item.notificationQueueError}</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-[0.08em] text-ink-soft" htmlFor={`note-${item.id}`}>
                  Nota interna
                </label>
                <textarea
                  id={`note-${item.id}`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-hairline bg-white p-2 text-[13px]"
                />
                <button
                  type="button"
                  disabled={saving || note === item.note}
                  onClick={() => void save({ note })}
                  className="rounded-full border border-ink px-4 py-1.5 text-[12px] font-medium disabled:opacity-40"
                >
                  {saving ? "Guardando…" : "Guardar nota"}
                </button>
                {saveError && <p className="text-[12px] text-[#8a3b3b]">{saveError}</p>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
