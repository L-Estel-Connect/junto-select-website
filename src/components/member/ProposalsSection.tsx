"use client";

import Link from "next/link";
import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { useMemberProfile } from "./useMemberProfile";
import { useBilling } from "@/lib/billing/useBilling";
import { isEntitledStatus } from "@/lib/billing/types";
import { primaryButtonClasses } from "@/lib/styles";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { useMemberQuery } from "@/lib/member/useMemberQuery";
import type { MemberInvitationView, MemberProposalView } from "@/lib/matching/memberLifecycleTypes";
import InvitationCard from "./InvitationCard";
import ProposalCard from "./ProposalCard";

const ACTIONABLE_INVITATION_STAGES: MemberInvitationView["stage"][] = ["invited", "viewed"];
const ACTIONABLE_PROPOSAL_STAGES: MemberProposalView["stage"][] = ["proposed", "viewed"];

/**
 * The real "Mis propuestas" experience: whatever currently needs this
 * member's attention (someone interested in them, or a curated selection
 * for them), shown FIRST regardless of membership status — see the
 * product principle "Do not make membership/payment the dominant element
 * when there is a human action waiting." Only once nothing is actionable
 * does this fall back to the original billing-status-driven "estamos
 * buscando por ti" / "activa tu búsqueda" messaging.
 */
export default function ProposalsSection({ uid }: { uid: string }) {
  const { ready, error, refresh } = useMemberProfile(uid);
  const { billing, loading: billingLoading, error: billingError } = useBilling(uid);

  const invitationsQuery = useMemberQuery(
    () => memberFetchJson<{ invitations: MemberInvitationView[] }>("/api/member/invitations"),
    [uid],
  );
  const proposalsQuery = useMemberQuery(
    () => memberFetchJson<{ proposals: MemberProposalView[] }>("/api/member/proposals"),
    [uid],
  );

  if (!ready) {
    if (error) return <IntroductionError message={error} onRetry={() => void refresh()} />;
    return <IntroductionLoading />;
  }
  if (billingLoading || !billing) {
    if (billingError) return <IntroductionError message={billingError} onRetry={() => window.location.reload()} />;
    return <IntroductionLoading />;
  }

  const lifecycleLoading =
    (!invitationsQuery.data && !invitationsQuery.error) || (!proposalsQuery.data && !proposalsQuery.error);
  if (lifecycleLoading) {
    return <IntroductionLoading />;
  }
  if (invitationsQuery.error || proposalsQuery.error) {
    return (
      <IntroductionError
        message={invitationsQuery.error ?? proposalsQuery.error ?? "No hemos podido cargar tus propuestas."}
        onRetry={() => {
          invitationsQuery.reload();
          proposalsQuery.reload();
        }}
      />
    );
  }

  const invitations = invitationsQuery.data?.invitations ?? [];
  const proposals = proposalsQuery.data?.proposals ?? [];

  const invitationsWaiting = invitations.filter((i) => ACTIONABLE_INVITATION_STAGES.includes(i.stage));
  const proposalsActionable = proposals.filter((p) => ACTIONABLE_PROPOSAL_STAGES.includes(p.stage));
  const proposalsWaiting = proposals.filter((p) => p.stage === "member_interested");

  const hasSomethingToShow =
    invitationsWaiting.length > 0 || proposalsActionable.length > 0 || proposalsWaiting.length > 0;

  const entitled = isEntitledStatus(billing.status);

  function reloadAll() {
    invitationsQuery.reload();
    proposalsQuery.reload();
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-6 py-14 sm:px-0">
      <h1 className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Mis propuestas
      </h1>

      {hasSomethingToShow ? (
        <div className="mt-10 space-y-6">
          {invitationsWaiting.map((invitation) => (
            <InvitationCard key={invitation.id} invitation={invitation} onDecided={reloadAll} />
          ))}
          {proposalsActionable.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} onDecided={reloadAll} />
          ))}
          {proposalsWaiting.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} onDecided={reloadAll} />
          ))}
        </div>
      ) : entitled ? (
        <div className="mt-14 flex min-h-[30svh] flex-col items-center justify-center text-center">
          <p className="text-[16px] text-ink">Estamos buscando por ti</p>
          <p className="mt-2 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
            Tu búsqueda está activa. Solo te enviaremos perfiles cuando encontremos una compatibilidad
            que cumpla nuestros criterios. Preferimos enviarte menos propuestas antes que bajar el nivel
            de selección.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-14 flex flex-col items-center text-center">
            <p className="text-[16px] text-ink">Tu perfil está en modo pasivo</p>
            <p className="mt-2 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
              Puedes ser seleccionado por otros miembros y responder a sus invitaciones sin pagar.
            </p>
          </div>

          <div className="mt-10 rounded-2xl border border-hairline bg-white p-6 text-center">
            <p className="text-[15px] font-medium text-ink">¿Quieres que Junto Select busque por ti?</p>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
              Activa tu búsqueda para recibir hasta 3 perfiles cuidadosamente seleccionados al mes,
              siempre que encontremos perfiles con suficiente compatibilidad.
            </p>
            <Link href="/member/plan" className={`${primaryButtonClasses} mt-5 inline-flex`}>
              Activar mi búsqueda
            </Link>
            <p className="mt-4 text-[12px] text-ink-soft">
              Además, como miembro tendrás ventajas y descuentos en nuestros eventos.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
