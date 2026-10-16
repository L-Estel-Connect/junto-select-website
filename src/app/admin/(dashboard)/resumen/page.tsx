"use client";

import Link from "next/link";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import { AdminError, AdminLoading } from "@/components/admin/States";
import StatCard from "@/components/admin/StatCard";

interface OverviewResponse {
  members: {
    total: number;
    activeSearch: number;
    passive: number;
    eligible: number;
    incomplete: number;
    suspectedDuplicates: number;
  };
  currentCycle: {
    id: string;
    mode: string;
    status: string;
    activeRecipients: number;
    processed: number;
    counts: { zero: number; one: number; two: number; three: number };
  } | null;
  funnel: {
    selections: number;
    viewed: number;
    memberInterested: number;
    memberPassed: number;
    invitationsSent: number;
    candidateInterested: number;
    candidatePassed: number;
    mutualIntroductions: number;
  } | null;
  attention: {
    zeroSelectionActiveMembers: number;
    failedRuns: number;
    staleRuns: number;
    openDuplicateCandidates: number;
    blockedPairs: number;
  };
}

export default function OverviewPage() {
  const { data, error } = useAdminQuery(() => adminFetchJson<OverviewResponse>("/api/admin/dashboard/overview"), []);

  if (error) return <AdminError message={error} />;
  if (!data) return <AdminLoading />;

  const { members, currentCycle, funnel, attention } = data;
  const attentionItems = [
    attention.zeroSelectionActiveMembers > 0 && {
      text: `${attention.zeroSelectionActiveMembers} miembros activos recibieron 0 selecciones este ciclo`,
      href: currentCycle ? `/admin/matching/${currentCycle.id}` : "/admin/matching",
    },
    attention.failedRuns > 0 && {
      text: `${attention.failedRuns} ejecuciones de matching fallaron`,
      href: currentCycle ? `/admin/matching/${currentCycle.id}` : "/admin/matching",
    },
    attention.staleRuns > 0 && {
      text: `${attention.staleRuns} ejecuciones quedaron a medias (posible caída)`,
      href: currentCycle ? `/admin/matching/${currentCycle.id}` : "/admin/matching",
    },
    attention.openDuplicateCandidates > 0 && {
      text: `${attention.openDuplicateCandidates} posibles duplicados sin revisar`,
      href: "/admin/review",
    },
    attention.blockedPairs > 0 && {
      text: `${attention.blockedPairs} parejas bloqueadas`,
      href: "/admin/review",
    },
  ].filter(Boolean) as { text: string; href: string }[];

  return (
    <div className="max-w-5xl">
      <h1 className="font-serif text-[26px] text-ink">Resumen</h1>

      <section className="mt-8">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">Miembros</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total" value={members.total} href="/admin/members" />
          <StatCard label="Búsqueda activa" value={members.activeSearch} href="/admin/members?filter=active_search" />
          <StatCard label="Pasivos" value={members.passive} href="/admin/members?filter=passive" />
          <StatCard label="Elegibles" value={members.eligible} href="/admin/members?filter=eligible" />
          <StatCard label="Incompletos" value={members.incomplete} href="/admin/members?filter=incomplete" />
          <StatCard label="Posibles duplicados" value={members.suspectedDuplicates} href="/admin/review" />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">Ciclo de matching actual</h2>
        {!currentCycle ? (
          <p className="mt-3 text-[14px] text-ink-soft">Todavía no se ha ejecutado ningún ciclo de matching.</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-4 text-[14px] text-ink-soft">
              <span>
                Ciclo <span className="font-medium text-ink">{currentCycle.id}</span>
              </span>
              <span>Modo: <span className="font-medium text-ink">{currentCycle.mode}</span></span>
              <span>Estado: <span className="font-medium text-ink">{currentCycle.status}</span></span>
              <span>
                Procesados: <span className="font-medium text-ink">{currentCycle.processed}</span> / {currentCycle.activeRecipients}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="0 selecciones" value={currentCycle.counts.zero} href={`/admin/members?filter=sel0`} />
              <StatCard label="1 selección" value={currentCycle.counts.one} href={`/admin/members?filter=sel1`} />
              <StatCard label="2 selecciones" value={currentCycle.counts.two} href={`/admin/members?filter=sel2`} />
              <StatCard label="3 selecciones" value={currentCycle.counts.three} href={`/admin/members?filter=sel3`} />
            </div>
            <Link
              href={`/admin/matching/${currentCycle.id}`}
              className="mt-3 inline-block text-[13px] font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink"
            >
              Ver detalle del ciclo →
            </Link>
          </>
        )}
      </section>

      {funnel && (
        <section className="mt-10">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">
            Embudo del ciclo actual
          </h2>
          <p className="mt-2 max-w-[60ch] text-[13px] text-ink-soft">
            Una selección no es una introducción — este embudo muestra en qué punto se queda cada propuesta.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FunnelStat label="Selecciones" value={funnel.selections} />
            <FunnelStat label="Vistas" value={funnel.viewed} />
            <FunnelStat label="Interés del miembro" value={funnel.memberInterested} />
            <FunnelStat label="Pasó el miembro" value={funnel.memberPassed} />
            <FunnelStat label="Invitaciones enviadas" value={funnel.invitationsSent} />
            <FunnelStat label="Interés del candidato" value={funnel.candidateInterested} />
            <FunnelStat label="Pasó el candidato" value={funnel.candidatePassed} />
            <FunnelStat label="Introducciones mutuas" value={funnel.mutualIntroductions} />
          </div>
        </section>
      )}

      <section className="mt-10 pb-10">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">Necesita atención</h2>
        {attentionItems.length === 0 ? (
          <p className="mt-3 text-[14px] text-ink-soft">Nada pendiente por ahora.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {attentionItems.map((item) => (
              <li key={item.text}>
                <Link
                  href={item.href}
                  className="block rounded-xl border border-hairline bg-white px-4 py-3 text-[14px] text-ink hover:border-rose"
                >
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FunnelStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-3">
      <p className="text-[12px] text-ink-soft">{label}</p>
      <p className="mt-1 font-serif text-[20px] text-ink">{value}</p>
    </div>
  );
}
