"use client";

import { useState } from "react";
import { adminFetch, adminFetchJson } from "@/lib/admin/adminFetch";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import ReconnectEventControls from "@/components/admin/ReconnectEventControls";
import type { AdminEventRow } from "@/app/api/admin/events/route";
import type { TicketTailorImport } from "@/lib/events/ticketTailorImport";
import { DEFAULT_EVENT_IMAGES } from "@/lib/events/editing";
import { EVENT_PUBLIC_STATUS_LABELS, type EventPublicStatus } from "@/lib/eventBenefits/types";

/**
 * Events Manager: one place to create, import from Ticket Tailor, edit,
 * preview, publish and archive events. Each event is one record that drives
 * the public website (Inicio, Encuentros), the member 20 % code and
 * Reconnect. Written for a non-technical admin: plain Spanish, one step at
 * a time, and the server re-checks every rule.
 */

type Form = {
  ticketTailorRef: string;
  label: string;
  eventType: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  city: string;
  venuePublic: string;
  description: string;
  imageUrl: string;
  priceFromEuros: string;
  publicStatus: EventPublicStatus;
  ticketTailorCheckoutUrl: string;
  memberBenefitEnabled: boolean;
  ticketTypeIds: string;
  reconnectEnabled: boolean;
};

const EMPTY: Form = {
  ticketTailorRef: "",
  label: "",
  eventType: "",
  eventDate: "",
  startTime: "",
  endTime: "",
  city: "Madrid",
  venuePublic: "",
  description: "",
  imageUrl: DEFAULT_EVENT_IMAGES[0].url,
  priceFromEuros: "",
  publicStatus: "draft",
  ticketTailorCheckoutUrl: "",
  memberBenefitEnabled: false,
  ticketTypeIds: "",
  reconnectEnabled: false,
};

const STATUS_HELP: Record<EventPublicStatus, string> = {
  draft: "Solo lo ves tú. No se puede publicar.",
  coming_soon: "Se muestra con fecha y detalles, sin botón de compra.",
  tickets_available: "Se muestra con el botón «Reservar» que lleva a Ticket Tailor.",
  sold_out: "Se muestra como «Completo», sin botón de compra.",
  completed: "El evento ya ha pasado. No aparece en la web.",
};

const input = "mt-1 w-full rounded-md border border-hairline px-3 py-2 text-[13px] disabled:bg-hairline/20 disabled:text-ink-soft";
const fieldLabel = "text-[11px] font-medium uppercase tracking-[0.08em] text-ink-soft";
const softButton = "rounded-full border border-hairline px-4 py-1.5 text-[12px] font-medium text-ink-soft hover:text-ink disabled:opacity-50";
const strongButton = "rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-white disabled:opacity-50";

const cleanError = (err: unknown, fallback: string) => (err instanceof Error ? err.message.replace(/^[a-z_]+: /, "") : fallback);

function formatDate(ymd: string | null | undefined, time?: string | null): string {
  if (!ymd) return "Sin fecha";
  const [y, m, d] = ymd.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return time ? `${day} · ${time}` : day;
}

function formFromEvent(e: AdminEventRow): Form {
  return {
    ticketTailorRef: "",
    label: e.label ?? "",
    eventType: e.eventType ?? "",
    eventDate: e.eventDate ?? "",
    startTime: e.startTime ?? "",
    endTime: e.endTime ?? "",
    city: e.city ?? "Madrid",
    venuePublic: e.venuePublic ?? "",
    description: e.description ?? "",
    imageUrl: e.imageUrl ?? DEFAULT_EVENT_IMAGES[0].url,
    priceFromEuros: e.priceFromEuros != null ? String(e.priceFromEuros) : "",
    publicStatus: e.publicStatus ?? "draft",
    ticketTailorCheckoutUrl: e.ticketTailorCheckoutUrl ?? "",
    // Older records have no flag: they counted as "on" when they had ticket types.
    memberBenefitEnabled: e.memberBenefitEnabled !== false && e.ticketTailorTicketTypeIds.length > 0,
    ticketTypeIds: e.ticketTailorTicketTypeIds.join(", "),
    reconnectEnabled: e.reconnectEnabled,
  };
}

export default function EventsManagerPage() {
  const eventsQuery = useAdminQuery(() => adminFetchJson<{ events: AdminEventRow[] }>("/api/admin/events"), []);
  const events = eventsQuery.data?.events ?? [];

  // Editor state. `editingId` null + open = creating a new event.
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [importInfo, setImportInfo] = useState<TicketTailorImport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [rowMessages, setRowMessages] = useState<Record<string, string>>({});

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const current = events.find((e) => e.ticketTailorEventId === editingId) ?? null;
  const canLink = !linked;

  function startNew(withTicketTailor: boolean) {
    setOpen(true);
    setEditingId(null);
    setLinked(false);
    setForm({ ...EMPTY, publicStatus: withTicketTailor ? "draft" : "coming_soon" });
    setImportInfo(null);
    setError(null);
    setNotice(withTicketTailor ? "Pega el enlace del evento en Ticket Tailor y pulsa «Importar datos»." : "Rellena los datos. Podrás añadir el enlace de Ticket Tailor más adelante.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEdit(e: AdminEventRow) {
    setOpen(true);
    setEditingId(e.ticketTailorEventId);
    setLinked(e.ticketTailorLinked !== false);
    setForm(formFromEvent(e));
    setImportInfo(null);
    setError(null);
    setNotice(null);
    setPreviewKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleImport() {
    setError(null);
    setNotice(null);
    setBusy("import");
    try {
      const { import: imp } = await adminFetchJson<{ import: TicketTailorImport }>("/api/admin/events/import", {
        method: "POST",
        body: JSON.stringify({ ref: form.ticketTailorRef }),
      });
      const f = imp.fields;
      setForm((prev) => ({
        ...prev,
        label: f.label ?? prev.label,
        eventDate: f.eventDate ?? prev.eventDate,
        startTime: f.startTime ?? prev.startTime,
        endTime: f.endTime ?? prev.endTime,
        description: f.description ?? prev.description,
        imageUrl: f.imageUrl ?? prev.imageUrl,
        ticketTailorCheckoutUrl: f.ticketTailorCheckoutUrl ?? prev.ticketTailorCheckoutUrl,
        ticketTypeIds: f.ticketTailorTicketTypeIds ? f.ticketTailorTicketTypeIds.join(", ") : prev.ticketTypeIds,
        publicStatus: f.publicStatus ?? prev.publicStatus,
      }));
      setImportInfo(imp);
    } catch (err) {
      setError(cleanError(err, "No se ha podido importar."));
    } finally {
      setBusy(null);
    }
  }

  async function handleUpload(file: File) {
    setError(null);
    setBusy("upload");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("eventId", editingId ?? "new");
      const res = await adminFetch("/api/admin/events/image", { method: "POST", body });
      const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (!data.ok || !data.url) throw new Error(data.error ?? "upload_failed");
      set("imageUrl", data.url);
    } catch (err) {
      setError(cleanError(err, "No se ha podido subir la imagen."));
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    setError(null);
    setNotice(null);
    setBusy("save");
    const payload = {
      ...form,
      ticketTailorRef: canLink ? form.ticketTailorRef : "",
      priceFromEuros: form.priceFromEuros.trim() === "" ? null : form.priceFromEuros.replace(",", "."),
      ticketTailorTicketTypeIds: form.ticketTypeIds.split(",").map((s) => s.trim()).filter(Boolean),
    };
    try {
      const { id } = await adminFetchJson<{ id: string }>(editingId ? `/api/admin/events/${encodeURIComponent(editingId)}` : "/api/admin/events", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setEditingId(id);
      if (form.ticketTailorRef.trim()) setLinked(true);
      setForm((f) => ({ ...f, ticketTailorRef: "" }));
      setNotice("Guardado. Revisa la vista previa y publica cuando quieras.");
      setPreviewKey((k) => k + 1);
      eventsQuery.reload();
    } catch (err) {
      setError(cleanError(err, "No se ha podido guardar."));
    } finally {
      setBusy(null);
    }
  }

  async function rowAction(e: AdminEventRow, action: "publish" | "unpublish" | "archive" | "restore" | "sync") {
    const id = e.ticketTailorEventId;
    setBusy(`${action}:${id}`);
    setRowMessages((m) => ({ ...m, [id]: "" }));
    try {
      if (action === "sync") {
        const { result } = await adminFetchJson<{ result: { checked: number; granted: number; errors: number } }>(
          "/api/admin/event-benefits/sync-event",
          { method: "POST", body: JSON.stringify({ ticketTailorEventId: id }) },
        );
        setRowMessages((m) => ({ ...m, [id]: `${result.granted} código(s) activado(s) de ${result.checked} pendiente(s)${result.errors ? `, ${result.errors} error(es)` : ""}.` }));
      } else if (action === "publish" || action === "unpublish") {
        await adminFetchJson(`/api/admin/events/${encodeURIComponent(id)}/publish`, {
          method: "POST",
          body: JSON.stringify({ published: action === "publish" }),
        });
        setRowMessages((m) => ({ ...m, [id]: action === "publish" ? "Publicado: ya aparece en Inicio y Encuentros." : "Retirado de la web." }));
      } else {
        await adminFetchJson(`/api/admin/events/${encodeURIComponent(id)}/archive`, {
          method: "POST",
          body: JSON.stringify({ archived: action === "archive" }),
        });
      }
      eventsQuery.reload();
    } catch (err) {
      setRowMessages((m) => ({ ...m, [id]: cleanError(err, "No se ha podido completar.") }));
    } finally {
      setBusy(null);
    }
  }

  // Upcoming (and undated) events first, soonest first; past events after them, most recent first.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const isPast = (e: AdminEventRow) => !!e.eventDate && e.eventDate < today;
  const filtered = events.filter((e) => showArchived || !e.archivedAt);
  const visible = [...filtered.filter((e) => !isPast(e)), ...filtered.filter(isPast).reverse()];
  const previewUrl = editingId ? `/eventos/vista-previa?id=${encodeURIComponent(editingId)}` : null;

  return (
    <div className="max-w-4xl pb-16">
      <h1 className="font-serif text-[26px] text-ink">Eventos</h1>
      <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-ink-soft">
        Crea y publica los encuentros de Junto Select. Cada evento publicado aparece automáticamente en Inicio
        y en Encuentros, por orden de fecha. Publicar en la web y ofrecer el 20 % a los miembros son decisiones
        independientes.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" className={strongButton} onClick={() => startNew(true)}>
          Nuevo evento desde Ticket Tailor
        </button>
        <button type="button" className={softButton} onClick={() => startNew(false)}>
          Nuevo evento sin entradas todavía
        </button>
      </div>

      {open && (
        <section className="mt-6 rounded-xl border border-hairline bg-white p-5" aria-label="Editor de evento">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-[15px] font-medium text-ink">{editingId ? `Editar: ${form.label || "evento"}` : "Nuevo evento"}</h2>
            <button type="button" className="text-[12px] text-ink-soft underline" onClick={() => setOpen(false)}>
              Cerrar editor
            </button>
          </div>
          {notice && <p className="mt-2 text-[12px] text-ink-soft">{notice}</p>}

          {/* 1. Ticket Tailor */}
          <h3 className="mt-5 text-[12px] font-medium uppercase tracking-[0.14em] text-ink-soft">1 · Ticket Tailor</h3>
          {linked ? (
            <p className="mt-2 text-[13px] text-ink">
              Vinculado al evento de Ticket Tailor nº {editingId}.{" "}
              {form.ticketTailorCheckoutUrl && (
                <a className="underline" href={form.ticketTailorCheckoutUrl} target="_blank" rel="noopener noreferrer">
                  Ver en Ticket Tailor
                </a>
              )}
            </p>
          ) : (
            <div className="mt-2">
              <label className={fieldLabel} htmlFor="tt-ref">
                Enlace del evento en Ticket Tailor {editingId ? "(cuando lo tengas)" : "(opcional)"}
              </label>
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  id="tt-ref"
                  className={`${input} mt-0 flex-1`}
                  placeholder="https://www.tickettailor.com/events/juntoselect/2439069"
                  value={form.ticketTailorRef}
                  onChange={(e) => set("ticketTailorRef", e.target.value)}
                />
                <button type="button" className={softButton} onClick={handleImport} disabled={!form.ticketTailorRef.trim() || busy === "import"}>
                  {busy === "import" ? "Importando…" : "Importar datos"}
                </button>
              </div>
              <p className="mt-1 text-[12px] text-ink-soft">
                Solo se leen datos; no se cambia nada en Ticket Tailor. Si la importación no funciona, rellena los datos a mano.
              </p>
            </div>
          )}
          {importInfo && (
            <div className="mt-3 rounded-md bg-paper p-3 text-[12px] leading-relaxed text-ink">
              <p>
                <strong>Importado de Ticket Tailor:</strong> {importInfo.imported.length ? importInfo.imported.join(", ") : "nada"}.
              </p>
              <p className="mt-1">
                <strong>Completa tú:</strong> {importInfo.missing.join(", ")}.
              </p>
              {importInfo.notes.map((n) => (
                <p key={n} className="mt-1 text-ink-soft">
                  {n}
                </p>
              ))}
              <p className="mt-1 text-ink-soft">Revisa todos los textos importados antes de publicar.</p>
            </div>
          )}

          {/* 2. Details */}
          <h3 className="mt-6 text-[12px] font-medium uppercase tracking-[0.14em] text-ink-soft">2 · Datos del evento</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={fieldLabel} htmlFor="ev-title">Título</label>
              <input id="ev-title" className={input} value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Junto Select Signature" />
            </div>
            <div>
              <label className={fieldLabel} htmlFor="ev-type">Tipo de evento</label>
              <input id="ev-type" className={input} list="event-types" value={form.eventType} onChange={(e) => set("eventType", e.target.value)} placeholder="Signature" />
              <datalist id="event-types">
                <option value="Signature" />
                <option value="Cena" />
                <option value="Cata" />
                <option value="Afterwork" />
              </datalist>
            </div>
            <div>
              <label className={fieldLabel} htmlFor="ev-city">Ciudad</label>
              <input id="ev-city" className={input} value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <label className={fieldLabel} htmlFor="ev-date">Fecha</label>
              <input id="ev-date" type="date" className={input} value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel} htmlFor="ev-start">Hora de inicio</label>
                <input id="ev-start" type="time" className={input} value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
              </div>
              <div>
                <label className={fieldLabel} htmlFor="ev-end">Hora de fin</label>
                <input id="ev-end" type="time" className={input} value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={fieldLabel} htmlFor="ev-venue">Lugar (texto público)</label>
              <input
                id="ev-venue"
                className={input}
                value={form.venuePublic}
                onChange={(e) => set("venuePublic", e.target.value)}
                placeholder="Déjalo vacío si aún no quieres mostrarlo"
              />
              <p className="mt-1 text-[12px] text-ink-soft">No pongas la dirección exacta: en la web solo se muestra este texto y la ciudad.</p>
            </div>
            <div className="sm:col-span-2">
              <label className={fieldLabel} htmlFor="ev-desc">Descripción</label>
              <textarea id="ev-desc" rows={4} className={input} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div>
              <label className={fieldLabel} htmlFor="ev-price">Precio desde (€, opcional)</label>
              <input id="ev-price" inputMode="decimal" className={input} value={form.priceFromEuros} onChange={(e) => set("priceFromEuros", e.target.value)} placeholder="Vacío = no se muestra" />
            </div>
          </div>

          {/* 3. Image */}
          <h3 className="mt-6 text-[12px] font-medium uppercase tracking-[0.14em] text-ink-soft">3 · Imagen</h3>
          <div className="mt-2 flex flex-wrap gap-3">
            {DEFAULT_EVENT_IMAGES.map((img) => (
              <label key={img.url} className={`cursor-pointer rounded-md border p-1 ${form.imageUrl === img.url ? "border-ink" : "border-hairline"}`}>
                <input type="radio" name="ev-image" className="sr-only" checked={form.imageUrl === img.url} onChange={() => set("imageUrl", img.url)} />
                {/* eslint-disable-next-line @next/next/no-img-element -- small admin thumbnails */}
                <img src={img.url} alt="" className="h-20 w-32 object-cover" />
                <span className="mt-1 block text-[11px] text-ink-soft">{img.label}</span>
              </label>
            ))}
            {form.imageUrl && !DEFAULT_EVENT_IMAGES.some((d) => d.url === form.imageUrl) && (
              <div className="rounded-md border border-ink p-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail */}
                <img src={form.imageUrl} alt="" className="h-20 w-32 object-cover" />
                <span className="mt-1 block text-[11px] text-ink-soft">Imagen propia del evento</span>
              </div>
            )}
          </div>
          <label className="mt-2 inline-block text-[12px] text-ink-soft">
            Subir una imagen del evento (JPG, PNG o WebP, hasta 5 MB):{" "}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Subir imagen del evento"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
          </label>
          {busy === "upload" && <p className="text-[12px] text-ink-soft">Subiendo…</p>}

          {/* 4. Status */}
          <h3 className="mt-6 text-[12px] font-medium uppercase tracking-[0.14em] text-ink-soft">4 · Estado</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={fieldLabel} htmlFor="ev-status">Estado</label>
              <select id="ev-status" className={input} value={form.publicStatus} onChange={(e) => set("publicStatus", e.target.value as EventPublicStatus)}>
                {(Object.keys(EVENT_PUBLIC_STATUS_LABELS) as EventPublicStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {EVENT_PUBLIC_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[12px] text-ink-soft">{STATUS_HELP[form.publicStatus]}</p>
            </div>
            <div>
              <label className={fieldLabel} htmlFor="ev-checkout">Enlace de compra (Ticket Tailor)</label>
              <input
                id="ev-checkout"
                className={input}
                value={form.ticketTailorCheckoutUrl}
                onChange={(e) => set("ticketTailorCheckoutUrl", e.target.value)}
                placeholder="https://www.tickettailor.com/events/…"
              />
              <p className="mt-1 text-[12px] text-ink-soft">Obligatorio para «Entradas disponibles».</p>
            </div>
          </div>

          {/* 5. Member benefit */}
          <h3 className="mt-6 text-[12px] font-medium uppercase tracking-[0.14em] text-ink-soft">5 · Beneficio miembros Select</h3>
          <label className="mt-2 flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" className="h-4 w-4" checked={form.memberBenefitEnabled} onChange={(e) => set("memberBenefitEnabled", e.target.checked)} />
            Ofrecer el 20 % a los miembros Select en este evento
          </label>
          {form.memberBenefitEnabled && (
            <div className="mt-2">
              <label className={fieldLabel} htmlFor="ev-tt-types">Tipos de entrada con descuento (empiezan por tt_)</label>
              <input id="ev-tt-types" className={input} value={form.ticketTypeIds} onChange={(e) => set("ticketTypeIds", e.target.value)} placeholder="tt_6869922, tt_6869920" />
              <p className="mt-1 text-[12px] text-ink-soft">
                {linked || form.ticketTailorRef.trim()
                  ? "Se rellenan al importar si Ticket Tailor los facilita. Cada miembro pide un código por ciclo mensual para el evento que elija."
                  : "Necesita un evento de Ticket Tailor: añade su enlace en el paso 1."}
              </p>
            </div>
          )}
          <label className="mt-3 flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" className="h-4 w-4" checked={form.reconnectEnabled} onChange={(e) => set("reconnectEnabled", e.target.checked)} />
            Reconnect activado (después del evento)
          </label>

          {error && (
            <p role="alert" className="mt-4 text-[13px] text-[#8a3b3b]">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" className={strongButton} onClick={handleSave} disabled={busy === "save"}>
              {busy === "save" ? "Guardando…" : "Guardar"}
            </button>
            {current && (
              <button
                type="button"
                className={softButton}
                disabled={busy !== null}
                onClick={() => rowAction(current, current.published ? "unpublish" : "publish")}
              >
                {current.published ? "Retirar de la web" : "Publicar en la web"}
              </button>
            )}
            {current && rowMessages[current.ticketTailorEventId] && (
              <span className="text-[12px] text-ink-soft">{rowMessages[current.ticketTailorEventId]}</span>
            )}
          </div>

          {/* 6. Preview */}
          {previewUrl && (
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-medium uppercase tracking-[0.14em] text-ink-soft">Vista previa (lo guardado)</h3>
                <a className="text-[12px] text-ink-soft underline" href={previewUrl} target="_blank" rel="noopener noreferrer">
                  Abrir en una pestaña
                </a>
              </div>
              <iframe key={previewKey} title="Vista previa del evento" src={previewUrl} className="mt-2 h-[760px] w-full rounded-md border border-hairline" />
            </div>
          )}
        </section>
      )}

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">Todos los eventos</h2>
          <label className="flex items-center gap-2 text-[12px] text-ink-soft">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Mostrar archivados
          </label>
        </div>
        {eventsQuery.error && <p className="mt-2 text-[13px] text-[#8a3b3b]">{eventsQuery.error}</p>}
        {visible.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-soft">Todavía no hay ningún evento.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {visible.map((e) => {
              const id = e.ticketTailorEventId;
              const isLinked = e.ticketTailorLinked !== false;
              const benefitOn = e.memberBenefitEnabled !== false && e.ticketTailorTicketTypeIds.length > 0 && isLinked;
              return (
                <article key={id} className="rounded-xl border border-hairline bg-white p-4" data-event-id={id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[14px] text-ink">{e.label}</p>
                      <p className="text-[12px] text-ink-soft">
                        {formatDate(e.eventDate, e.startTime)} · {e.city ?? "Madrid"}
                      </p>
                      <p className="mt-1 text-[12px] text-ink-soft">
                        <span className="text-ink">{EVENT_PUBLIC_STATUS_LABELS[e.publicStatus ?? "draft"]}</span>
                        {" · "}
                        {isPast(e) ? "Ya celebrado · " : ""}
                        {e.archivedAt ? "Archivado" : e.published ? "Publicado en la web" : "No publicado"}
                        {" · "}20 % miembros: {benefitOn ? "sí" : "no"}
                        {benefitOn ? ` (${e.benefitCount} código(s))` : ""}
                        {" · "}
                        {isLinked ? `Ticket Tailor nº ${id}` : "Sin Ticket Tailor"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={softButton} onClick={() => startEdit(e)}>
                        Editar
                      </button>
                      {!e.archivedAt && (
                        <button type="button" className={softButton} disabled={busy !== null} onClick={() => rowAction(e, e.published ? "unpublish" : "publish")}>
                          {e.published ? "Retirar de la web" : "Publicar"}
                        </button>
                      )}
                      <button type="button" className={softButton} disabled={busy !== null} onClick={() => rowAction(e, e.archivedAt ? "restore" : "archive")}>
                        {e.archivedAt ? "Restaurar" : "Archivar"}
                      </button>
                      {benefitOn && (
                        <button type="button" className={softButton} disabled={busy !== null} onClick={() => rowAction(e, "sync")} title="Reintenta los códigos pedidos que aún no están activos en Ticket Tailor">
                          Reintentar códigos
                        </button>
                      )}
                    </div>
                  </div>
                  {rowMessages[id] && <p className="mt-2 text-[12px] text-ink-soft">{rowMessages[id]}</p>}
                  {isLinked && <ReconnectEventControls event={e} />}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
