"use client";

import { useState } from "react";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import type { EligibleTicketTailorEventDocument } from "@/lib/eventBenefits/types";
import type { ReconnectAdminSummary } from "@/lib/eventReconnect/adminSummary";
import { parseTicketTailorCsv, SKIP_REASON_LABELS, type ParsedTicketTailorCsv } from "@/lib/eventReconnect/ticketTailorCsv";

type ImportRow = { email: string; firstName: string | null; lastName: string | null; phone: string | null; ticketTailorOrderId: string | null };

const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  firstName: "Nombre",
  lastName: "Apellidos",
  fullName: "Nombre completo",
  phone: "Teléfono",
  orderId: "Pedido",
  status: "Estado",
};

/** What the pasted text or file holds: a Ticket Tailor CSV, or the older JSON array (still accepted). */
function readImportText(text: string): ParsedTicketTailorCsv {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[")) return parseTicketTailorCsv(trimmed);
  let rows: unknown;
  try {
    rows = JSON.parse(trimmed);
  } catch {
    rows = null;
  }
  if (!Array.isArray(rows)) {
    return { ok: false, error: "El texto empieza como JSON pero no es una lista válida.", columns: {}, rows: [], skipped: [], duplicatesInFile: 0, withoutFirstName: 0, totalDataRows: 0 };
  }
  // Same checks as the CSV, by turning the JSON back into a small CSV.
  const esc = (v: unknown) => `"${String(typeof v === "string" ? v : "").replace(/"/g, '""')}"`;
  const csv = ["email,first name,last name,phone,order id"]
    .concat(rows.map((r: Record<string, unknown>) => [r?.email, r?.firstName, r?.lastName, r?.phone, r?.ticketTailorOrderId].map(esc).join(",")))
    .join("\n");
  return parseTicketTailorCsv(csv);
}

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
 * import (the Ticket Tailor CSV, previewed before anything is saved), and a
 * read-only summary — everything else (the 48h/72h windows)
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
  const [preview, setPreview] = useState<{ parsed: ParsedTicketTailorCsv; alreadyImported: string[] } | null>(null);
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

  const toRows = (parsed: ParsedTicketTailorCsv): ImportRow[] =>
    parsed.rows.map(({ email, firstName, lastName, phone, ticketTailorOrderId }) => ({ email, firstName, lastName, phone, ticketTailorOrderId }));

  async function handlePreview(text: string) {
    setImportError(null);
    setImportResult(null);
    setPreview(null);
    const parsed = readImportText(text);
    if (!parsed.ok) {
      setImportError(parsed.error ?? "No se ha podido leer el archivo.");
      return;
    }
    setImporting(true);
    try {
      const { preview: p } = await adminFetchJson<{ preview: { valid: number; alreadyImported: string[] } }>(
        "/api/admin/event-reconnect/import-participants",
        { method: "POST", body: JSON.stringify({ eventId: event.ticketTailorEventId, rows: toRows(parsed), dryRun: true }) },
      );
      setPreview({ parsed, alreadyImported: p.alreadyImported });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "No se ha podido revisar el archivo.");
    } finally {
      setImporting(false);
    }
  }

  async function handleFile(file: File) {
    const text = await file.text();
    setImportText(text);
    await handlePreview(text);
  }

  async function handleImport() {
    if (!preview) return;
    setImportError(null);
    setImporting(true);
    try {
      const { result } = await adminFetchJson<{
        result: { attempted: number; imported: number; alreadyImported: number };
      }>("/api/admin/event-reconnect/import-participants", {
        method: "POST",
        body: JSON.stringify({ eventId: event.ticketTailorEventId, rows: toRows(preview.parsed) }),
      });
      const skipped = preview.parsed.skipped.length;
      setImportResult(
        `Importación hecha: ${result.imported} participantes nuevos, ${result.alreadyImported} ya estaban importados` +
          (skipped ? `, ${skipped} filas descartadas.` : "."),
      );
      setImportText("");
      setPreview(null);
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
            Sube el CSV exportado de Ticket Tailor (pedidos o entradas) o pega su contenido. Solo el email es
            obligatorio; el nombre se usa en la galería. Nada se guarda hasta que confirmes.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Archivo CSV de Ticket Tailor"
            className="mt-2 block text-[12px]"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <textarea
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setPreview(null);
            }}
            rows={4}
            placeholder={"Order ID,First name,Last name,Email\n12345,Ana,García,ana@example.com"}
            aria-label="Contenido del CSV"
            className="mt-2 w-full rounded-md border border-hairline px-3 py-2 font-mono text-[12px]"
          />
          <button
            type="button"
            onClick={() => handlePreview(importText)}
            disabled={importing || !importText.trim()}
            className="mt-2 rounded-full border border-hairline px-4 py-1.5 text-[12px] font-medium text-ink-soft hover:text-ink disabled:opacity-50"
          >
            {importing && !preview ? "Revisando…" : "Revisar"}
          </button>

          {preview && (() => {
            const { parsed, alreadyImported } = preview;
            const existing = new Set(alreadyImported);
            const newCount = parsed.rows.filter((r) => !existing.has(r.email)).length;
            return (
              <div className="mt-3 rounded-md bg-paper p-3 text-[12px] leading-relaxed text-ink" data-testid="import-preview">
                <p>
                  <strong>Columnas detectadas:</strong>{" "}
                  {Object.entries(parsed.columns)
                    .map(([k, v]) => `${FIELD_LABELS[k] ?? k} ← «${v}»`)
                    .join(" · ")}
                </p>
                <p className="mt-1">
                  <strong>{parsed.totalDataRows} filas:</strong> {newCount} participantes nuevos, {parsed.rows.length - newCount} ya
                  importados, {parsed.duplicatesInFile} entradas repetidas del mismo email, {parsed.skipped.length} descartadas.
                </p>
                {parsed.withoutFirstName > 0 && (
                  <p className="mt-1 text-ink-soft">
                    {parsed.withoutFirstName} sin nombre: podrán activar Reconnect, pero no aparecerán en la galería hasta hacerlo.
                  </p>
                )}
                {parsed.skipped.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-[#8a3b3b]">
                    {parsed.skipped.slice(0, 10).map((r) => (
                      <li key={r.line}>
                        Línea {r.line}: {SKIP_REASON_LABELS[r.reason]}
                        {r.value ? ` (${r.value})` : ""}
                      </li>
                    ))}
                    {parsed.skipped.length > 10 && <li>… y {parsed.skipped.length - 10} más.</li>}
                  </ul>
                )}
                {parsed.rows.length > 0 && (
                  <table className="mt-2 w-full text-left">
                    <thead>
                      <tr className="text-ink-soft">
                        <th className="pr-2 font-medium">Nombre</th>
                        <th className="pr-2 font-medium">Apellidos</th>
                        <th className="pr-2 font-medium">Email</th>
                        <th className="font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 8).map((r) => (
                        <tr key={r.email}>
                          <td className="pr-2">{r.firstName ?? "—"}</td>
                          <td className="pr-2">{r.lastName ?? ""}</td>
                          <td className="pr-2">{r.email}</td>
                          <td className="text-ink-soft">{existing.has(r.email) ? "ya importado" : "nuevo"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {parsed.rows.length > 8 && <p className="mt-1 text-ink-soft">… y {parsed.rows.length - 8} más.</p>}
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || newCount === 0}
                  className="mt-3 rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
                >
                  {importing ? "Importando…" : newCount === 0 ? "Nada nuevo que importar" : `Importar ${newCount} participantes`}
                </button>
              </div>
            );
          })()}
          {importResult && <p className="mt-2 text-[12px] text-ink-soft">{importResult}</p>}
          {importError && <p className="mt-2 text-[12px] text-[#8a3b3b]">{importError}</p>}
        </div>
      )}

      {summaryError && <p className="mt-2 text-[12px] text-[#8a3b3b]">{summaryError}</p>}
      {summary && (
        <p className="mt-2 text-[12px] text-ink-soft">
          {summary.participantsImported} importados · {summary.activated} activados · {summary.optedOut} no
          participan · {summary.requestsSent} solicitudes enviadas · {summary.accepted} conexiones aceptadas.
        </p>
      )}
    </div>
  );
}
