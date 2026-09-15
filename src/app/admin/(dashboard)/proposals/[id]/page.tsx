"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { AdminError, AdminLoading } from "@/components/admin/States";
import Badge from "@/components/admin/Badge";
import PhotoThumb from "@/components/admin/PhotoThumb";
import WhyBreakdown from "@/components/admin/WhyBreakdown";
import { genderLabel, relationshipIntentionLabel } from "@/lib/admin/labels";
import type { MatchWhy } from "@/lib/admin/why";
import type { AdminProfileView } from "@/lib/admin/memberDetail";
import type { InvitationDocument, IntroductionDocument, PairHistoryDocument, ProposalDocument } from "@/lib/matching/types";

interface ProposalDetailResponse {
  proposal: ProposalDocument;
  invitation: InvitationDocument | null;
  introduction: IntroductionDocument | null;
  recipient: AdminProfileView | null;
  candidate: AdminProfileView | null;
  pairHistory: PairHistoryDocument | null;
  why: MatchWhy;
}

/**
 * Defensive on purpose: the API route now always sends ISO strings (see
 * that route's own comment on why), but this never assumes it — a raw
 * Firestore Timestamp (`.toDate()`), an already-serialized one
 * (`{_seconds}`/`{seconds}`, in case some future field forgets the
 * server-side conversion), or a genuinely bad/legacy value must all
 * degrade to "—", never to the literal string "Invalid Date".
 */
function fmt(ts: unknown): string {
  if (!ts) return "—";
  let date: Date | null = null;
  if (ts instanceof Date) {
    date = ts;
  } else if (typeof ts === "string" || typeof ts === "number") {
    date = new Date(ts);
  } else if (typeof ts === "object") {
    const t = ts as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof t.toDate === "function") date = t.toDate();
    else if (typeof t._seconds === "number") date = new Date(t._seconds * 1000);
    else if (typeof t.seconds === "number") date = new Date(t.seconds * 1000);
  }
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

function PersonCard({ person }: { person: AdminProfileView | null }) {
  if (!person) return <p className="text-[14px] text-ink-soft">Perfil no disponible.</p>;
  return (
    <div className="rounded-xl border border-hairline bg-white p-5">
      <div className="flex items-center gap-3">
        <PhotoThumb path={person.photos[0] ?? null} alt={person.firstName} size={48} rounded="lg" />
        <div>
          <Link href={`/admin/members/${person.uid}`} className="font-medium text-ink hover:underline">
            {person.firstName} {person.age ? `· ${person.age}` : ""}
          </Link>
          <p className="text-[13px] text-ink-soft">
            {genderLabel(person.gender)} · {person.city}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[13px] text-ink-soft">Busca: {relationshipIntentionLabel(person.relationshipIntention)}</p>
    </div>
  );
}

export default function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ProposalDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetchJson<ProposalDetailResponse>(`/api/admin/dashboard/proposals/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <AdminError message={error} />;
  if (!data) return <AdminLoading />;

  const { proposal, invitation, introduction, recipient, candidate, pairHistory } = data;

  return (
    <div className="max-w-4xl pb-16">
      <Link href="/admin/proposals" className="text-[13px] text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink">
        ← Propuestas
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <h1 className="font-serif text-[24px] text-ink">Propuesta</h1>
        {proposal.source === "admin_manual" && <Badge tone="neutral">Sugerencia del equipo</Badge>}
      </div>
      <p className="mt-1 text-[13px] text-ink-soft">
        Ciclo: {proposal.cycleId} · Creada: {fmt(proposal.createdAt)}
      </p>
      {proposal.adminSuggestion?.note && (
        <p className="mt-2 rounded-lg bg-rose-tint px-3 py-2 text-[13px] text-ink">
          Nota interna: {proposal.adminSuggestion.note}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <PersonCard person={recipient} />
        <PersonCard person={candidate} />
      </div>

      <div className="mt-6">
        <WhyBreakdown why={data.why} />
      </div>

      <section className="mt-8">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">Cronología</h2>
        <div className="mt-3 space-y-2 rounded-xl border border-hairline bg-white p-5 text-[14px]">
          <p>Seleccionada: {fmt(proposal.createdAt)}</p>
          <p>
            Decisión del miembro:{" "}
            {proposal.stage === "proposed" || proposal.stage === "viewed"
              ? "Pendiente"
              : `${proposal.stage === "member_passed" ? "Pasó" : "Le interesó"} (${fmt(proposal.decidedAt)})`}
          </p>
          {invitation && (
            <p>
              Invitación al candidato: enviada {fmt(invitation.createdAt)}
              {invitation.decidedAt ? ` · respondió ${fmt(invitation.decidedAt)}` : " · pendiente de respuesta"}
            </p>
          )}
          {introduction && <p>Introducción mutua: {fmt(introduction.createdAt)}</p>}
          <p>Revelación de contacto: {introduction?.contactRevealedAt ? fmt(introduction.contactRevealedAt) : "Aún no disponible"}</p>
        </div>
      </section>

      {pairHistory && (
        <section className="mt-8">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">Historial de la pareja</h2>
          <div className="mt-3 rounded-xl border border-hairline bg-white p-5 text-[14px] text-ink">
            <p>Estado: {pairHistory.state}</p>
            {pairHistory.state === "blocked" && <p className="text-[#8a3b3b]">Motivo del bloqueo: {pairHistory.blockedReason}</p>}
            {pairHistory.state === "passed" && Boolean(pairHistory.cooldownUntil) && (
              <p>En periodo de espera hasta: {fmt(pairHistory.cooldownUntil)}</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
