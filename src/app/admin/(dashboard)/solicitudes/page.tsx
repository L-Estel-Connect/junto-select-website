"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

const CLOSED: InquiryStatus[] = ["espera", "descartada"];
/** Statuses set by hand. "Cliente" is not one of them: it comes only from creating the client. */
const MANUAL_STATUSES = INQUIRY_STATUSES.filter((s) => s.value !== "cliente");

type View = "abiertas" | "clientes" | "cerradas" | "todas";

/** Open = still being handled. A request marked "Cliente" before the fix, without a client record, stays open until converted. */
function viewOf(i: InquiryRow): Exclude<View, "todas"> {
  if (i.clientId) return "clientes";
  if (CLOSED.includes(i.status)) return "cerradas";
  return "abiertas";
}

/**
 * Matchmaking applications from /matchmaking. Each one is handled here
 * until it becomes a client with "Convertir en cliente", which creates the
 * client's record (or links the one that already exists) and opens it.
 * The request itself stays, for history.
 */
export default function AdminInquiriesPage() {
  const [filter, setFilter] = useState<View>("abiertas");
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, error, reload } = useAdminQuery(
    () => adminFetchJson<{ items: InquiryRow[] }>("/api/admin/dashboard/inquiries"),
    [],
  );

  if (error) return <AdminError message={error} />;
  if (!data) return <AdminLoading />;

  const items = data.items.filter((i) => filter === "todas" || viewOf(i) === filter);
  const count = (v: Exclude<View, "todas">) => data.items.filter((i) => viewOf(i) === v).length;

  return (
    <div>
      <h1 className="font-serif text-[30px] text-ink">Solicitudes</h1>
      <p className="mt-2 max-w-[70ch] text-[13px] text-ink-soft">
        Peticiones de consulta privada enviadas desde la página Matchmaking. Cuando alguien contrata un programa,
        pulsa «Convertir en cliente»: se crea su ficha con los datos de la solicitud, y la solicitud se conserva.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {[
          { value: "abiertas" as const, label: `Abiertas (${count("abiertas")})` },
          { value: "clientes" as const, label: `Ya son clientes (${count("clientes")})` },
          { value: "cerradas" as const, label: `En espera o descartadas (${count("cerradas")})` },
          { value: "todas" as const, label: `Todas (${data.items.length})` },
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
              <th className="px-4 py-3"></th>
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
                <td colSpan={7} className="px-4 py-8 text-center text-ink-soft">
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
  const router = useRouter();
  const [note, setNote] = useState(item.note);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function convert() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await adminFetchJson<{ client: { id: string } }>("/api/admin/clients", {
        method: "POST",
        body: JSON.stringify({ fromInquiryId: item.id }),
      });
      router.push(`/admin/clientes/${res.client.id}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "No se ha podido crear el cliente.");
      setSaving(false);
    }
  }

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
          {item.clientId ? (
            <Badge tone="positive">Cliente</Badge>
          ) : (
            <select
              aria-label={`Estado de ${item.nombre}`}
              value={item.status === "cliente" ? "propuesta" : item.status}
              disabled={saving}
              onChange={(e) => void save({ status: e.target.value as InquiryStatus })}
              className="rounded-full border border-hairline bg-white px-3 py-1.5 text-[12px]"
            >
              {MANUAL_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          {item.clientId ? (
            <Link href={`/admin/clientes/${item.clientId}`} className="whitespace-nowrap text-[13px] font-medium text-ink underline decoration-hairline underline-offset-4">
              Ver ficha del cliente →
            </Link>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void convert()}
              className="whitespace-nowrap rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-white hover:bg-ink/85 disabled:opacity-40"
            >
              Convertir en cliente
            </button>
          )}
          {saveError && <p className="mt-1 text-[12px] text-[#8a3b3b]">{saveError}</p>}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-hairline bg-[#faf7f2]">
          <td colSpan={7} className="px-4 py-4">
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
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
