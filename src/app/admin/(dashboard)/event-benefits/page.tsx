"use client";

import { useState } from "react";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import type { EligibleTicketTailorEventDocument } from "@/lib/eventBenefits/types";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";

/**
 * V1's entire "event management" surface, deliberately minimal per spec:
 * register which Ticket Tailor event/ticket types are eligible for the
 * member benefit, and a "Sync member discounts" button per eligible event
 * — the explicit, admin-triggered alternative to a Ticket Tailor
 * event.created webhook (see the implementation report). No polling, no
 * elaborate dashboard: this reads the small `eligibleTicketTailorEvents`
 * collection once and lets Lara register/sync from here.
 */
export default function EventBenefitsPage() {
  const eventsQuery = useAdminQuery(
    () => adminFetchJson<{ events: EligibleTicketTailorEventDocument[] }>("/api/admin/event-benefits/eligible-events"),
    [],
  );

  const [eventId, setEventId] = useState("");
  const [ticketTypeIds, setTicketTypeIds] = useState("");
  const [label, setLabel] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<Record<string, string>>({});

  async function handleRegister() {
    setRegisterError(null);
    const ids = ticketTypeIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!eventId.trim() || !label.trim() || ids.length === 0) {
      setRegisterError("Completa el ID del evento, un nombre y al menos un ID de tipo de entrada.");
      return;
    }
    setRegistering(true);
    try {
      await adminFetchJson("/api/admin/event-benefits/eligible-events", {
        method: "POST",
        body: JSON.stringify({ ticketTailorEventId: eventId.trim(), ticketTailorTicketTypeIds: ids, label: label.trim() }),
      });
      setEventId("");
      setTicketTypeIds("");
      setLabel("");
      eventsQuery.reload();
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "No se ha podido registrar el evento.");
    } finally {
      setRegistering(false);
    }
  }

  async function handleSync(ticketTailorEventId: string) {
    setSyncingId(ticketTailorEventId);
    try {
      const { result } = await adminFetchJson<{
        result: { attempted: number; succeeded: number; failed: number };
      }>("/api/admin/event-benefits/sync-event", {
        method: "POST",
        body: JSON.stringify({ ticketTailorEventId }),
      });
      setSyncResults((prev) => ({
        ...prev,
        [ticketTailorEventId]: `${result.succeeded}/${result.attempted} sincronizados${result.failed > 0 ? `, ${result.failed} fallidos` : ""}.`,
      }));
      eventsQuery.reload();
    } catch (err) {
      setSyncResults((prev) => ({
        ...prev,
        [ticketTailorEventId]: err instanceof Error ? `Error: ${err.message}` : "Error al sincronizar.",
      }));
    } finally {
      setSyncingId(null);
    }
  }

  const events = eventsQuery.data?.events ?? [];

  return (
    <div className="max-w-4xl pb-16">
      <h1 className="font-serif text-[26px] text-ink">Eventos — beneficio Junto Select</h1>
      <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-ink-soft">
        Registra aquí qué eventos/tipos de entrada de Ticket Tailor participan en el 20 % de descuento
        mensual de los miembros. Después de crear un evento elegible en Ticket Tailor, usa
        &ldquo;Sincronizar&rdquo; para asociar los descuentos actualmente activos de los miembros con sus
        tipos de entrada.
      </p>

      <section className="mt-8 rounded-xl border border-hairline bg-white p-4">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">Registrar evento elegible</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            type="text"
            placeholder="ID de evento (Ticket Tailor)"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="rounded-md border border-hairline px-3 py-2 text-[13px]"
          />
          <input
            type="text"
            placeholder="IDs de tipo de entrada (separados por comas)"
            value={ticketTypeIds}
            onChange={(e) => setTicketTypeIds(e.target.value)}
            className="rounded-md border border-hairline px-3 py-2 text-[13px]"
          />
          <input
            type="text"
            placeholder="Nombre descriptivo"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded-md border border-hairline px-3 py-2 text-[13px]"
          />
        </div>
        {registerError && <p className="mt-2 text-[12px] text-[#8a3b3b]">{registerError}</p>}
        <button
          type="button"
          onClick={handleRegister}
          disabled={registering}
          className="mt-3 rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
        >
          {registering ? "Guardando…" : "Registrar"}
        </button>
      </section>

      <section className="mt-10">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">Eventos elegibles</h2>
        {eventsQuery.error && <p className="mt-2 text-[13px] text-[#8a3b3b]">{eventsQuery.error}</p>}
        {events.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-soft">Todavía no hay ningún evento registrado.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {events.map((event) => (
              <div key={event.ticketTailorEventId} className="rounded-xl border border-hairline bg-white p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[14px] text-ink">{event.label}</p>
                    <p className="text-[12px] text-ink-soft">
                      {event.ticketTailorEventId} · {event.ticketTailorTicketTypeIds.length} tipo(s) de entrada
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSync(event.ticketTailorEventId)}
                    disabled={syncingId === event.ticketTailorEventId}
                    className="rounded-full border border-hairline px-4 py-1.5 text-[12px] font-medium text-ink-soft hover:text-ink disabled:opacity-50"
                  >
                    {syncingId === event.ticketTailorEventId ? "Sincronizando…" : "Sincronizar"}
                  </button>
                </div>
                {syncResults[event.ticketTailorEventId] && (
                  <p className="mt-2 text-[12px] text-ink-soft">{syncResults[event.ticketTailorEventId]}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
