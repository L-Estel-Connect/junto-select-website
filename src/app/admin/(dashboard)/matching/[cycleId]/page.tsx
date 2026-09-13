"use client";

import { use, useState } from "react";
import Link from "next/link";
import { adminFetch, adminFetchJson } from "@/lib/admin/adminFetch";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import { AdminEmpty, AdminError, AdminLoading } from "@/components/admin/States";
import Badge from "@/components/admin/Badge";
import PhotoThumb from "@/components/admin/PhotoThumb";
import { HARD_FILTER_REASON_LABELS, PAIR_HISTORY_REASON_LABELS } from "@/lib/admin/labels";
import type { MatchingCycleDocument, MemberRunDiagnostics } from "@/lib/matching/types";

interface RecipientRow {
  personId: string;
  uid: string | null;
  firstName: string;
  photoPath: string | null;
  runStatus: string;
  proposalCount: number | null;
  error: string | null;
  diagnostics: MemberRunDiagnostics | null;
}

export default function CycleDetailPage({ params }: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = use(params);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const { data, error, reload } = useAdminQuery(
    () =>
      adminFetchJson<{ cycle: MatchingCycleDocument; recipients: RecipientRow[] }>(
        `/api/admin/dashboard/matching/cycles/${cycleId}`,
      ),
    [cycleId],
  );
  const cycle = data?.cycle ?? null;
  const recipients = data?.recipients ?? null;

  async function handleRetry() {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await adminFetch(`/api/admin/dashboard/matching/cycles/${cycleId}/retry`, { method: "POST" });
      if (!res.ok) throw new Error("retry_failed");
      reload();
    } catch {
      setRetryError("No se ha podido reintentar el ciclo.");
    } finally {
      setRetrying(false);
    }
  }

  if (error) return <AdminError message={error} />;
  if (!cycle || !recipients) return <AdminLoading />;

  const hasIssues = recipients.some((r) => r.runStatus === "failed") || cycle.status !== "completed";

  return (
    <div className="max-w-5xl">
      <Link href="/admin/matching" className="text-[13px] text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink">
        ← Ciclos
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="font-serif text-[26px] text-ink">Ciclo {cycle.id}</h1>
        {hasIssues && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="rounded-full border border-ink px-4 py-2 text-[13px] font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-60"
          >
            {retrying ? "Reintentando…" : "Reintentar pendientes/fallidos"}
          </button>
        )}
      </div>
      <p className="mt-1 text-[14px] text-ink-soft">
        Modo: {cycle.mode} · Estado: {cycle.status} · Umbral de calidad: {cycle.config.qualityThreshold}
      </p>
      {retryError && <p className="mt-2 text-[13px] text-[#8a3b3b]">{retryError}</p>}

      <div className="mt-6">
        {recipients.length === 0 ? (
          <AdminEmpty message="No hay destinatarios en este ciclo." />
        ) : (
          <div className="space-y-2">
            {recipients.map((r) => (
              <RecipientCard key={r.personId} r={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecipientCard({ r }: { r: RecipientRow }) {
  const [expanded, setExpanded] = useState(false);
  const zero = r.proposalCount === 0;

  return (
    <div className={`rounded-xl border bg-white p-4 ${zero ? "border-[#f0d7d4]" : "border-hairline"}`}>
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-center gap-3">
          <PhotoThumb path={r.photoPath} alt={r.firstName} size={36} />
          {r.uid ? (
            <Link href={`/admin/members/${r.uid}`} className="font-medium text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
              {r.firstName}
            </Link>
          ) : (
            <span className="font-medium text-ink">{r.firstName}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {r.runStatus === "failed" && <Badge tone="negative">Fallido</Badge>}
          {r.runStatus === "claimed" && <Badge tone="warning">En curso / a medias</Badge>}
          <Badge tone={zero ? "warning" : "positive"}>
            {r.proposalCount === null ? "—" : `${r.proposalCount} selecciones`}
          </Badge>
        </div>
      </button>

      {r.error && <p className="mt-2 text-[13px] text-[#8a3b3b]">{r.error}</p>}

      {expanded && r.diagnostics && (
        <div className="mt-3 grid gap-4 border-t border-hairline pt-3 sm:grid-cols-2">
          <div className="text-[13px] text-ink">
            <p>Bolsa de candidatos: {r.diagnostics.candidatePoolSize}</p>
            <p>Pasaron los requisitos imprescindibles: {r.diagnostics.hardFilterSurvivors}</p>
            <p>Superaron el umbral: {r.diagnostics.aboveQualityThreshold}</p>
            <p>Puntuación más alta: {r.diagnostics.highestScore ?? "—"}</p>
          </div>
          <div className="text-[13px] text-ink-soft">
            {Object.entries(r.diagnostics.hardFilterExcluded).map(([reason, count]) => (
              <p key={reason}>
                {HARD_FILTER_REASON_LABELS[reason] ?? reason}: {count}
              </p>
            ))}
            {Object.entries(r.diagnostics.pairHistoryExcluded).map(([reason, count]) => (
              <p key={reason}>
                {PAIR_HISTORY_REASON_LABELS[reason] ?? reason}: {count}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
