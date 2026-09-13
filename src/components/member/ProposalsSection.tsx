"use client";

import Link from "next/link";
import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { useMemberProfile } from "./useMemberProfile";
import { useBilling } from "@/lib/billing/useBilling";
import { isEntitledStatus } from "@/lib/billing/types";
import { primaryButtonClasses } from "@/lib/styles";

/**
 * The empty state depends on real membership/search status (billing/{uid},
 * webhook-driven) — never a generic "nothing here yet" regardless of
 * whether the person is passive or an already-paying active searcher.
 * There is still no real proposals *list* UI (the matching engine's
 * proposal documents aren't rendered anywhere yet) — this only replaces
 * what the single empty state says, per membership status.
 */
export default function ProposalsSection({ uid }: { uid: string }) {
  const { ready, error, refresh } = useMemberProfile(uid);
  const { billing, loading: billingLoading, error: billingError } = useBilling(uid);

  if (!ready) {
    if (error) return <IntroductionError message={error} onRetry={() => void refresh()} />;
    return <IntroductionLoading />;
  }
  if (billingLoading || !billing) {
    if (billingError) return <IntroductionError message={billingError} onRetry={() => window.location.reload()} />;
    return <IntroductionLoading />;
  }

  const entitled = isEntitledStatus(billing.status);

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-6 py-14 sm:px-0">
      <h1 className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Mis propuestas
      </h1>

      {entitled ? (
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
