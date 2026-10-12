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
 * every other /member page it does NOT require a finalized introductions
 * profile: a new Select member arrives here right after paying, before
 * the questionnaire, and this page is where they start it. A member whose
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
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-6 py-14 sm:px-0">
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
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-6 py-14 sm:px-0">
      <p className="text-[12px] uppercase tracking-[0.22em] text-ink-soft">Membresía Select</p>
      <h1 className="font-serif text-[30px] font-normal leading-snug text-ink sm:text-[34px]">
        Bienvenido/a al club. Tu membresía está activa.
      </h1>
      {plan && <p className="text-[15px] text-ink-soft">Plan: {plan.label}.</p>}

      <div className="border-y border-hairline py-6">
        <p className="font-serif text-[22px] leading-snug text-ink">Activa tus introducciones privadas</p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          Cuéntanos quién eres y qué buscas. Tus introducciones empiezan en cuanto tu perfil privado esté completo,
          así que te recomendamos hacerlo cuanto antes. Tu perfil nunca se publica: solo lo ven las personas a las
          que te proponemos.
        </p>
        <Link href={nextRoute} className={`${primaryButtonClasses} mt-6`}>
          {started ? "Continuar mi perfil" : "Completar mi perfil"}
        </Link>
      </div>

      {/* The monthly event privilege is part of the membership, not of the
          introductions profile, so it is shown here too — otherwise a member
          who hasn't finished the questionnaire could never see their code. */}
      <EventBenefitSection uid={uid} />
    </div>
  );
}
