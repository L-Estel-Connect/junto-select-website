"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import { AdminError, AdminLoading } from "@/components/admin/States";
import Badge from "@/components/admin/Badge";
import type { InquiryRow } from "@/lib/admin/inquiries";
import { CLIENT_STATUSES, PAYMENT_STATUSES, PROGRAMMES, clientFullName, type ClientView } from "@/lib/clients/types";
import { errorText, formatDate, linkButton, pillButton, primaryPill } from "@/components/admin/clients/ui";

interface ListItem {
  client: ClientView;
  shortlisted: number;
  presented: number;
  lastActivity: string | null;
}

const OPEN_INQUIRY = ["nueva", "contactada", "entrevista", "propuesta"];

/**
 * Clientes: the start of the day. Open a client, or create one (empty or
 * from a request sent through /matchmaking). Everything else happens on
 * the client's own page.
 */
export default function ClientesPage() {
  const router = useRouter();
  const [view, setView] = useState<"activos" | "todos">("activos");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [showInquiries, setShowInquiries] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useAdminQuery(() => adminFetchJson<{ items: ListItem[] }>("/api/admin/clients"), []);
  const inquiries = useAdminQuery(
    () =>
      showInquiries
        ? adminFetchJson<{ items: InquiryRow[] }>("/api/admin/dashboard/inquiries")
        : Promise.resolve(null),
    [showInquiries],
  );

  async function create(body: Record<string, unknown>) {
    setCreating(true);
    setError(null);
    try {
      const res = await adminFetchJson<{ client: ClientView }>("/api/admin/clients", {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.push(`/admin/clientes/${res.client.id}`);
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : null));
      setCreating(false);
    }
  }

  if (list.error) return <AdminError message={errorText(list.error) ?? undefined} />;
  if (!list.data) return <AdminLoading />;

  const q = query.trim().toLowerCase();
  const items = list.data.items.filter(
    (i) =>
      (view === "todos" || i.client.status === "activo" || i.client.status === "en_pausa") &&
      (!q || clientFullName(i.client).toLowerCase().includes(q) || i.client.city.toLowerCase().includes(q)),
  );
  const openInquiries = (inquiries.data?.items ?? []).filter((i) => !i.clientId && (OPEN_INQUIRY.includes(i.status) || i.status === "cliente"));

  return (
    <div className="max-w-[1100px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[30px] text-ink">Clientes</h1>
          <p className="mt-1 text-[14px] text-ink-soft">Programa Select y Select Privado.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={pillButton} onClick={() => setShowInquiries((v) => !v)}>
            Desde una solicitud
          </button>
          <button type="button" className={primaryPill} disabled={creating} onClick={() => void create({})}>
            {creating ? "Creando…" : "Nuevo cliente"}
          </button>
        </div>
      </div>
      {error && <p className="mt-4 text-[13px] text-[#8a3b3b]">{error}</p>}

      {showInquiries && (
        <div className="mt-6 rounded-2xl border border-hairline bg-white p-5">
          <p className="text-[13px] text-ink-soft">
            Solicitudes abiertas de la página Matchmaking. Al convertir una, sus datos pasan a la ficha del cliente.
          </p>
          {!inquiries.data && !inquiries.error && <p className="mt-3 text-[13px] text-ink-soft">Cargando…</p>}
          {inquiries.data && openInquiries.length === 0 && (
            <p className="mt-3 text-[13px] text-ink-soft">No hay solicitudes abiertas sin convertir.</p>
          )}
          <ul className="mt-3 divide-y divide-hairline">
            {openInquiries.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="text-[14px] text-ink">
                  {i.nombre} {i.apellidos}
                  <span className="ml-2 text-ink-soft">
                    {i.edad ?? "—"} · {i.ciudad || "—"} · {formatDate(i.createdAt)}
                  </span>
                </div>
                <button type="button" className={pillButton} disabled={creating} onClick={() => void create({ fromInquiryId: i.id })}>
                  Convertir en cliente
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {(["activos", "todos"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors ${
              view === v ? "border-ink bg-ink text-white" : "border-hairline text-ink-soft hover:border-ink"
            }`}
          >
            {v === "activos" ? "Activos" : "Todos"}
          </button>
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o ciudad"
          aria-label="Buscar cliente"
          className="ml-auto w-full max-w-[280px] rounded-full border border-hairline bg-white px-4 py-1.5 text-[13px] focus:border-rose-dark focus:outline-none"
        />
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-hairline px-6 py-14 text-center">
          <p className="text-[15px] text-ink">{list.data.items.length === 0 ? "Aún no hay clientes." : "Ningún cliente en esta vista."}</p>
          {list.data.items.length === 0 && (
            <p className="mt-2 text-[13px] text-ink-soft">Crea el primero con «Nuevo cliente» o desde una solicitud.</p>
          )}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-hairline bg-white">
          <table className="w-full min-w-[760px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-hairline text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Programa</th>
                <th className="px-5 py-3 font-medium">Periodo</th>
                <th className="px-5 py-3 font-medium">Pago</th>
                <th className="px-5 py-3 font-medium">Presentados</th>
                <th className="px-5 py-3 font-medium">Preselección</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ client: c, shortlisted, presented }) => {
                const programme = c.programme ? PROGRAMMES[c.programme] : null;
                const status = CLIENT_STATUSES.find((s) => s.value === c.status)?.label ?? c.status;
                const payment = PAYMENT_STATUSES.find((s) => s.value === c.payment.status)?.label ?? "—";
                return (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-b border-hairline last:border-b-0 hover:bg-rose-tint/40"
                    onClick={() => router.push(`/admin/clientes/${c.id}`)}
                  >
                    <td className="px-5 py-4">
                      <Link href={`/admin/clientes/${c.id}`} className="font-medium text-ink" onClick={(e) => e.stopPropagation()}>
                        {clientFullName(c)}
                      </Link>
                      <div className="mt-0.5 text-[13px] text-ink-soft">
                        {[c.ageYears !== null ? `${c.ageYears} años` : null, c.city || null].filter(Boolean).join(" · ") || "Ficha por completar"}
                        {c.status !== "activo" && <span className="ml-2"><Badge tone="muted">{status}</Badge></span>}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-ink">{programme?.label ?? <span className="text-ink-soft">Sin programa</span>}</td>
                    <td className="px-5 py-4 text-ink-soft">
                      {c.programmeStart ? `${formatDate(c.programmeStart)} – ${formatDate(c.programmeEnd)}` : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={c.payment.status === "pagado" ? "positive" : c.payment.status === "pendiente" ? "warning" : "muted"}>
                        {payment}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-ink">
                      {presented}
                      {programme && <span className="text-ink-soft"> de {programme.proposals}</span>}
                    </td>
                    <td className="px-5 py-4 text-ink-soft">{shortlisted}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-6 text-[12px] text-ink-soft">
        Nada en esta sección envía mensajes ni emails: cada contacto lo gestionas tú. <Link href="/admin/solicitudes" className={linkButton}>Ver todas las solicitudes</Link>
      </p>
    </div>
  );
}
