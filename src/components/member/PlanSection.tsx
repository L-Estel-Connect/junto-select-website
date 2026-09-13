"use client";

import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { useMemberProfile } from "./useMemberProfile";

/**
 * Structure-only — no billing exists yet. `Perfil pasivo` here is a safe
 * placeholder, not a real membership field; see README for exactly what
 * would need to be added (a membership tier + renewal date on the
 * profile/account, most likely) before this can show real state.
 */
export default function PlanSection({ uid }: { uid: string }) {
  const { ready, error, refresh } = useMemberProfile(uid);
  if (!ready) {
    if (error) return <IntroductionError message={error} onRetry={() => void refresh()} />;
    return <IntroductionLoading />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-6 py-14 sm:px-0">
      <h1 className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Mi plan
      </h1>
      <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
        Por ahora, formar parte de Junto Select es gratuito. Tu perfil
        permanece en nuestra base privada y puede ser considerado para
        futuras presentaciones.
      </p>

      <div className="mt-10 border-t border-hairline">
        <div className="flex items-center justify-between border-b border-hairline py-4">
          <span className="text-[15px] text-ink">Plan actual</span>
          <span className="text-[13px] text-ink-soft">Perfil pasivo</span>
        </div>
      </div>

      <div className="mt-10">
        <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">
          Próximamente
        </p>
        <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
          Una membresía Select activa te permitirá recibir presentaciones
          seleccionadas de forma continua. Te avisaremos cuando esté
          disponible.
        </p>
      </div>

      <button
        type="button"
        disabled
        className="mt-10 w-full cursor-not-allowed rounded-full border border-hairline px-9 py-4 text-center text-[13px] font-medium uppercase tracking-[0.18em] text-ink-soft opacity-60"
      >
        Cancelar suscripción
      </button>
    </div>
  );
}
