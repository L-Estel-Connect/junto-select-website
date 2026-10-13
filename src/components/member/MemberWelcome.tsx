"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import { getNextOnboardingRoute } from "@/lib/introduction/completion";
import { primaryButtonClasses } from "@/lib/styles";
import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { useBilling } from "@/lib/billing/useBilling";
import { isEntitledStatus } from "@/lib/billing/types";
import { PLAN_DISPLAY } from "@/lib/billing/plans";
import { EventBenefitSection } from "@/components/member/PlanSection";

/**
 * Landing page of the membership-first path (Stripe returns here). Unlike
 * the introductions pages it does NOT require a finalized profile: the
 * membership benefits work without one, and the profile is offered as an
 * optional next step for members who want active introductions. A member whose
 * profile is already finalized is simply sent on to /member.
 */
export default function MemberWelcome({ uid }: { uid: string }) {
  const router = useRouter();
  const { profile, error, refresh } = useSharedProfile(uid);
  const { billing, loading: billingLoading } = useBilling(uid);
  const [fromCheckout, setFromCheckout] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFromCheckout(new URLSearchParams(window.location.search).get("checkout") === "success");
  }, []);

  useEffect(() => {
    if (profile?.meta.onboardingFinalized) router.replace("/member");
  }, [profile, router]);

  if (!profile) {
    if (error) return <IntroductionError message={error} onRetry={() => void refresh()} />;
    return <IntroductionLoading />;
  }
  if (profile.meta.onboardingFinalized || billingLoading) return <IntroductionLoading />;

  const entitled = billing ? isEntitledStatus(billing.status) : false;
  const nextRoute = getNextOnboardingRoute(profile);
  const started = nextRoute !== "/introduction/onboarding";

  if (!entitled) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 py-14">
        {fromCheckout ? (
          <>
            <h1 className="font-serif text-[28px] font-normal leading-snug text-ink">Estamos confirmando tu pago…</h1>
            <p className="text-[15px] leading-relaxed text-ink-soft">
              Suele tardar unos segundos. Esta página se actualizará sola en cuanto Stripe nos lo confirme.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-serif text-[28px] font-normal leading-snug text-ink">Aún no eres miembro Select.</h1>
            <p className="text-[15px] leading-relaxed text-ink-soft">
              Descubre la Membresía Select y elige tu plan para formar parte del club por completo.
            </p>
            <Link href="/membresia#planes" className={primaryButtonClasses}>
              Ver la Membresía Select
            </Link>
          </>
        )}
      </div>
    );
  }

  const plan = billing?.planKey ? PLAN_DISPLAY[billing.planKey] : null;

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 py-14">
      <p className="text-[12px] uppercase tracking-[0.22em] text-ink-soft">Membresía Select</p>
      <h1 className="font-serif text-[30px] font-normal leading-snug text-ink sm:text-[34px]">
        Bienvenido/a al club. Tu membresía está activa.
      </h1>
      {plan && <p className="text-[15px] text-ink-soft">Plan: {plan.label}.</p>}

      <p className="text-[15px] leading-relaxed text-ink-soft">
        Tus ventajas de miembro ya están activas: no necesitas un perfil de introducciones para usar tu 20 % ni
        para formar parte de la comunidad.
      </p>

      {/* The monthly event privilege is part of the membership, not of the
          introductions profile, so it comes first here. */}
      <EventBenefitSection uid={uid} />

      <div className="border-y border-hairline py-6">
        <p className="font-serif text-[22px] leading-snug text-ink">Introducciones privadas, cuando quieras</p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          Si quieres que busquemos activamente por ti, completa tu perfil privado. La búsqueda empieza en cuanto
          esté completo. Tu perfil nunca se publica: solo lo ven las personas a las que te proponemos.
        </p>
        <Link href={nextRoute} className={`${primaryButtonClasses} mt-6`}>
          {started ? "Continuar mi perfil" : "Completar mi perfil"}
        </Link>
      </div>
    </div>
  );
}
