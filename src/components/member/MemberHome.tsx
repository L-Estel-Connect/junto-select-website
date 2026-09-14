"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import { requireFinalized } from "@/lib/introduction/completion";
import { primaryButtonClasses } from "@/lib/styles";
import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { useBilling } from "@/lib/billing/useBilling";
import { isEntitledStatus } from "@/lib/billing/types";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { useMemberQuery } from "@/lib/member/useMemberQuery";
import type { MemberLifecycleSummary } from "@/lib/matching/memberLifecycleTypes";

const linkClasses =
  "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-hairline py-4">
      <span className="text-[15px] text-ink">{label}</span>
      <span className="text-[13px] text-ink-soft">{value}</span>
    </div>
  );
}

/**
 * The one place a member sees, at a glance: profile complete, search
 * active/passive, and — most important, shown FIRST and never subordinate
 * to membership/billing state — whether something needs their attention
 * right now (a proposal waiting, someone waiting on them, or a new mutual
 * introduction). See getLifecycleSummaryForMember for the three cheap
 * counts this reads; the full lists live on /member/proposals and
 * /member/connections.
 */
export default function MemberHome({ uid }: { uid: string }) {
  const router = useRouter();
  const { profile, error: profileError, refresh: refreshProfile } = useSharedProfile(uid);
  const { billing, loading: billingLoading } = useBilling(uid);
  const summaryQuery = useMemberQuery(
    () => memberFetchJson<{ summary: MemberLifecycleSummary }>("/api/member/lifecycle-summary"),
    [uid],
  );

  useEffect(() => {
    if (!profile) return;
    const redirect = requireFinalized(profile);
    if (redirect) router.replace(redirect);
  }, [profile, router]);

  if (!profile) {
    if (profileError) {
      return <IntroductionError message={profileError} onRetry={() => void refreshProfile()} />;
    }
    return <IntroductionLoading />;
  }

  if (requireFinalized(profile)) {
    return <IntroductionLoading />;
  }

  const summary = summaryQuery.data?.summary ?? null;
  const searchLabel = billingLoading || !billing ? "…" : isEntitledStatus(billing.status) ? "Activa" : "Pasiva";

  const pendingCount = summary
    ? summary.proposalsWaitingForDecision + summary.invitationsWaitingForDecision
    : 0;
  const hasPending = pendingCount > 0;
  const hasIntroductions = (summary?.mutualIntroductionsCount ?? 0) > 0;

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-6 py-14 sm:px-0">
      <p className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Hola, {profile.visible.firstName || "de nuevo"}
      </p>
      <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
        Tu perfil está listo. Ya formas parte de Junto Select. Cuando
        encontremos a alguien que encaje contigo, te avisaremos.
      </p>

      {hasPending && (
        <div className="mt-8 rounded-2xl border border-rose bg-white p-6">
          <p className="text-[15px] font-medium text-ink">
            {summary!.invitationsWaitingForDecision > 0 && summary!.proposalsWaitingForDecision > 0
              ? "Tienes una propuesta y alguien esperando tu respuesta."
              : summary!.invitationsWaitingForDecision > 0
                ? "Alguien está esperando tu respuesta."
                : "Tienes una propuesta esperando tu respuesta."}
          </p>
          <Link href="/member/proposals" className={`${primaryButtonClasses} mt-4 inline-flex`}>
            Ver ahora
          </Link>
        </div>
      )}

      {!hasPending && hasIntroductions && (
        <div className="mt-8 rounded-2xl border border-hairline bg-white p-6">
          <p className="text-[15px] font-medium text-ink">Tienes una introducción mutua.</p>
          <Link href="/member/connections" className={`mt-3 inline-block text-sm ${linkClasses}`}>
            Ver mi conexión
          </Link>
        </div>
      )}

      <div className="mt-10 border-t border-hairline">
        <StatusRow label="Perfil" value="Completo" />
        <StatusRow label="Búsqueda" value={searchLabel} />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-6">
        <Link href="/member/profile" className={primaryButtonClasses}>
          Ver mi perfil
        </Link>
        <Link href="/member/profile#editar-perfil" className={`text-sm ${linkClasses}`}>
          Editar mi perfil
        </Link>
      </div>

      {!hasPending && (
        <div className="mt-14 border-t border-hairline pt-8">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">
            Tus propuestas
          </p>
          <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
            Cuando tengamos una propuesta para ti, o alguien se interese en conocerte, aparecerá aquí.
          </p>
          <Link href="/member/proposals" className={`mt-3 inline-block text-sm ${linkClasses}`}>
            Ver mis propuestas
          </Link>
        </div>
      )}
    </div>
  );
}
