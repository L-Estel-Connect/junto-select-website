"use client";

import { useState } from "react";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import type { EligibleTicketTailorEventDocument } from "@/lib/eventBenefits/types";
import type { ReconnectAdminSummary } from "@/lib/eventReconnect/adminSummary";

function formatDate(value: unknown): string | null {
  const ts = value as { toDate?: () => Date } | null | undefined;
  const date = ts?.toDate ? ts.toDate() : null;
  if (!date) return null;
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * The V1 Reconnect admin surface for ONE event — deliberately bolted onto
 * the existing event-benefits card rather than a separate page, per the
 * product spec: extend the existing Ticket Tailor event/admin architecture,
 * never build a separate event-management product. Lara needs exactly
 * three things beyond what already exists here: force-close, a participant
 * import, and a read-only summary — everything else (the 48h/72h windows)
 * derives automatically from eventDate/reconnectEnabled, which are edited
 * via the page's own register form (see "Editar" on the parent card).
 */
export default function ReconnectEventControls({ event }: { event: EligibleTicketTailorEventDocument }) {
  const [forceClosing, setForceClosing] = useState(false);
  const [forceCloseError, setForceCloseError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReconnectAdminSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const forceClosed = Boolean(event.reconnectForceClosedAt);

  async function handleToggleForceClose() {
    setForceCloseError(null);
    setForceClosing(true);
    try {
      await adminFetchJson("/api/admin/event-reconnect/force-close", {
        method: "POST",
        body: JSON.stringify({ ticketTailorEventId: event.ticketTailorEventId, forceClosed: !forceClosed }),
      });
      window.location.reload();
    } catch (err) {
      setForceCloseError(err instanceof Error ? err.message : "No se ha podido actualizar.");
    } finally {
      setForceClosing(false);
    }
  }

  async function handleImport() {
    setImportError(null);
    setImportResult(null);
    let rows: unknown;
    try {
      rows = JSON.parse(importText);
      if (!Array.isArray(rows)) throw new Error("not_array");
    } catch {
      setImportError('Pega un array JSON, p.ej. [{"email":"a@b.com","firstName":"Ana"}]');
      return;
    }
    setImporting(true);
    try {
      const { result } = await adminFetchJson<{
        result: { attempted: number; imported: number; alreadyImported: number };
      }>("/api/admin/event-reconnect/import-participants", {
        method: "POST",
        body: JSON.stringify({ eventId: event.ticketTailorEventId, rows }),
      });
      setImportResult(`${result.imported} nuevos, ${result.alreadyImported} ya existentes, de ${result.attempted}.`);
      setImportText("");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "No se ha podido importar.");
    } finally {
      setImporting(false);
    }
  }

  async function handleLoadSummary() {
    setSummaryError(null);
    setSummaryLoading(true);
    try {
      const { summary: s } = await adminFetchJson<{ summary: ReconnectAdminSummary }>(
        `/api/admin/event-reconnect/summary?eventId=${encodeURIComponent(event.ticketTailorEventId)}`,
      );
      setSummary(s);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "No se ha podido cargar el resumen.");
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <div className="mt-3 border-t border-hairline pt-3">
      <p className="text-[12px] text-ink-soft">
        Reconnect: {event.reconnectEnabled ? "activado" : "desactivado"}
        {event.eventDate ? ` · fecha del evento ${event.eventDate}` : " · sin fecha (Reconnect nunca se abrirá)"}
        {forceClosed && ` · cerrado manualmente el ${formatDate(event.reconnectForceClosedAt)}`}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {event.reconnectEnabled && (
          <button
            type="button"
            onClick={handleToggleForceClose}
            disabled={forceClosing}
            className="rounded-full border border-hairline px-3 py-1 text-[12px] text-ink-soft hover:text-ink disabled:opacity-50"
          >
            {forceClosing ? "Actualizando…" : forceClosed ? "Reabrir Reconnect" : "Forzar cierre de Reconnect"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setImportOpen((v) => !v)}
          className="rounded-full border border-hairline px-3 py-1 text-[12px] text-ink-soft hover:text-ink"
        >
          Importar participantes
        </button>
        <button
          type="button"
          onClick={handleLoadSummary}
          disabled={summaryLoading}
          className="rounded-full border border-hairline px-3 py-1 text-[12px] text-ink-soft hover:text-ink disabled:opacity-50"
        >
          {summaryLoading ? "Cargando…" : "Ver resumen"}
        </button>
      </div>
      {forceCloseError && <p className="mt-1 text-[12px] text-[#8a3b3b]">{forceCloseError}</p>}

      {importOpen && (
        <div className="mt-3">
          <p className="text-[12px] text-ink-soft">
            Pega aquí el array JSON exportado de Ticket Tailor: email, firstName, lastName, phone,
            ticketTailorOrderId (solo email es obligatorio).
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={4}
            placeholder='[{"email":"ana@example.com","firstName":"Ana"}]'
            className="mt-2 w-full rounded-md border border-hairline px-3 py-2 font-mono text-[12px]"
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={importing || !importText.trim()}
            className="mt-2 rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
          >
            {importing ? "Importando…" : "Importar"}
          </button>
          {importResult && <p className="mt-2 text-[12px] text-ink-soft">{importResult}</p>}
          {importError && <p className="mt-2 text-[12px] text-[#8a3b3b]">{importError}</p>}
        </div>
      )}

      {summaryError && <p className="mt-2 text-[12px] text-[#8a3b3b]">{summaryError}</p>}
      {summary && (
        <p className="mt-2 text-[12px] text-ink-soft">
          {summary.participantsImported} importados · {summary.activated} activados · {summary.requestsSent}{" "}
          solicitudes enviadas · {summary.accepted} conexiones aceptadas.
        </p>
      )}
    </div>
  );
}
