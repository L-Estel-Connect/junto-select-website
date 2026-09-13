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

function fmt(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
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
        Ciclo: {proposal.cycleId} · Creada: {fmt(proposal.createdAt as string)}
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
          <p>Seleccionada: {fmt(proposal.createdAt as string)}</p>
          <p>
            Decisión del miembro:{" "}
            {proposal.stage === "proposed" || proposal.stage === "viewed"
              ? "Pendiente"
              : `${proposal.stage === "member_passed" ? "Pasó" : "Le interesó"} (${fmt(proposal.decidedAt as string)})`}
          </p>
          {invitation && (
            <p>
              Invitación al candidato: enviada {fmt(invitation.createdAt as string)}
              {invitation.decidedAt ? ` · respondió ${fmt(invitation.decidedAt as string)}` : " · pendiente de respuesta"}
            </p>
          )}
          {introduction && <p>Introducción mutua: {fmt(introduction.createdAt as string)}</p>}
          <p>Revelación de contacto: {introduction?.contactRevealedAt ? fmt(introduction.contactRevealedAt as string) : "Aún no disponible"}</p>
        </div>
      </section>

      {pairHistory && (
        <section className="mt-8">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">Historial de la pareja</h2>
          <div className="mt-3 rounded-xl border border-hairline bg-white p-5 text-[14px] text-ink">
            <p>Estado: {pairHistory.state}</p>
            {pairHistory.state === "blocked" && <p className="text-[#8a3b3b]">Motivo del bloqueo: {pairHistory.blockedReason}</p>}
            {pairHistory.state === "passed" && Boolean(pairHistory.cooldownUntil) && (
              <p>En periodo de espera hasta: {fmt(pairHistory.cooldownUntil as string)}</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
