"use client";

import { useState } from "react";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import type { EligibleTicketTailorEventDocument } from "@/lib/eventBenefits/types";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import ReconnectEventControls from "@/components/admin/ReconnectEventControls";

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
  const [eventDate, setEventDate] = useState("");
  const [reconnectEnabled, setReconnectEnabled] = useState(false);
  // Defaults to true for a brand-new registration — the common case
  // (registering an event for the 20% benefit) stays a single click, same
  // as before this toggle existed. An admin who wants a Reconnect-only
  // event unchecks it, which also lifts the ticket-type-ID requirement
  // below — see the two independent switches this product decision calls
  // for (an event can be either, both, or neither).
  const [memberBenefitEnabled, setMemberBenefitEnabled] = useState(true);
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
    if (!eventId.trim() || !label.trim()) {
      setRegisterError("Completa el ID del evento y un nombre descriptivo.");
      return;
    }
    if (memberBenefitEnabled && ids.length === 0) {
      setRegisterError("El beneficio -20% necesita al menos un ID de tipo de entrada.");
      return;
    }
    setRegistering(true);
    try {
      await adminFetchJson("/api/admin/event-benefits/eligible-events", {
        method: "POST",
        body: JSON.stringify({
          ticketTailorEventId: eventId.trim(),
          ticketTailorTicketTypeIds: ids,
          label: label.trim(),
          eventDate: eventDate.trim() || null,
          reconnectEnabled,
          memberBenefitEnabled,
        }),
      });
      setEventId("");
      setTicketTypeIds("");
      setLabel("");
      setEventDate("");
      setReconnectEnabled(false);
      setMemberBenefitEnabled(true);
      eventsQuery.reload();
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "No se ha podido registrar el evento.");
    } finally {
      setRegistering(false);
    }
  }

  function handleEdit(event: EligibleTicketTailorEventDocument) {
    setEventId(event.ticketTailorEventId);
    setTicketTypeIds(event.ticketTailorTicketTypeIds.join(", "));
    setLabel(event.label);
    setEventDate(event.eventDate ?? "");
    setReconnectEnabled(event.reconnectEnabled);
    // A document written before this toggle existed has no
    // memberBenefitEnabled field at all — treat that the same as `true`
    // for display, mirroring getAllEligibleTicketTypeIds()'s own read-time
    // compatibility rule, so an old event doesn't appear to have silently
    // lost its benefit the first time someone opens it to edit.
    setMemberBenefitEnabled(event.memberBenefitEnabled !== false);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
            placeholder={
              memberBenefitEnabled
                ? "IDs de tipo de entrada (separados por comas)"
                : "IDs de tipo de entrada (no necesario solo para Reconnect)"
            }
            value={ticketTypeIds}
            onChange={(e) => setTicketTypeIds(e.target.value)}
            className="rounded-md border border-hairline px-3 py-2 text-[13px] disabled:bg-hairline/20 disabled:text-ink-soft"
            disabled={!memberBenefitEnabled}
          />
          <input
            type="text"
            placeholder="Nombre descriptivo"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded-md border border-hairline px-3 py-2 text-[13px]"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={memberBenefitEnabled}
              onChange={(e) => setMemberBenefitEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            Beneficio miembros -20%
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={reconnectEnabled}
              onChange={(e) => setReconnectEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            Reconnect activado
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            Fecha del evento
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="rounded-md border border-hairline px-3 py-2 text-[13px]"
            />
          </label>
        </div>
        <p className="mt-2 text-[12px] text-ink-soft">
          Estos dos interruptores son completamente independientes: un evento puede tener el beneficio
          -20%, Reconnect, ambos o ninguno. Los IDs de tipo de entrada solo son necesarios si el
          beneficio -20% está activado — Reconnect no los usa para nada.
        </p>
        <p className="mt-1 text-[12px] text-ink-soft">
          Reconnect se abre automáticamente a las 00:01 del día siguiente a la fecha del evento y se
          cierra 48 horas después — nunca se configura manualmente.
        </p>
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
                    <p className="mt-1 text-[12px] text-ink-soft">
                      Beneficio -20%: {event.memberBenefitEnabled !== false ? "activado" : "desactivado"} · Reconnect:{" "}
                      {event.reconnectEnabled ? "activado" : "desactivado"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(event)}
                      className="rounded-full border border-hairline px-4 py-1.5 text-[12px] font-medium text-ink-soft hover:text-ink"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSync(event.ticketTailorEventId)}
                      disabled={syncingId === event.ticketTailorEventId}
                      className="rounded-full border border-hairline px-4 py-1.5 text-[12px] font-medium text-ink-soft hover:text-ink disabled:opacity-50"
                    >
                      {syncingId === event.ticketTailorEventId ? "Sincronizando…" : "Sincronizar"}
                    </button>
                  </div>
                </div>
                {syncResults[event.ticketTailorEventId] && (
                  <p className="mt-2 text-[12px] text-ink-soft">{syncResults[event.ticketTailorEventId]}</p>
                )}
                <ReconnectEventControls event={event} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
