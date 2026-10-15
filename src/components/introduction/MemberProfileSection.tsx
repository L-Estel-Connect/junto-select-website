"use client";

import { MEMBERSHIP_SALES_OPEN } from "@/lib/billing/membershipSales";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { finalizeOnboarding, updateProfileFields } from "@/lib/introduction/profile";
import { useBilling } from "@/lib/billing/useBilling";
import { isEntitledStatus } from "@/lib/billing/types";
import { isMarketAvailabilityEligible } from "@/lib/introduction/completion";
import { PlanCheckoutForm } from "@/components/member/PlanSection";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import { legacyFetchJson } from "@/lib/legacyImport/legacyFetch";
import { memberFetchJson } from "@/lib/member/memberFetch";
import {
  getPrerequisiteRedirect,
  isAboutMeComplete,
  isPhotosComplete,
  isPreferencesComplete,
  isPresentationComplete,
} from "@/lib/introduction/completion";
import { primaryButtonClasses, secondaryButtonClasses } from "@/lib/styles";
import { getAge } from "@/lib/introduction/age";
import type { ProfileDocument } from "@/lib/introduction/types";
import { OnboardingStepper } from "./OnboardingFrame";
import PrivatePhotoThumbnail from "./PrivatePhotoThumbnail";
import ProfileCard from "./ProfileCard";
import { IntroductionError, IntroductionLoading } from "./RequireIntroductionAuth";

const linkClasses =
  "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

interface SectionInfo {
  label: string;
  complete: boolean;
  href: string | null;
}

export default function MemberProfileSection({ uid }: { uid: string }) {
  const router = useRouter();
  const { profile, error: profileError, refresh: refreshProfile, mutate } = useSharedProfile(uid);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const { billing, loading: billingLoading } = useBilling(uid);
  const entitled = !!billing && isEntitledStatus(billing.status);
  const [checkoutParam, setCheckoutParam] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  // Shown once, right after this visit finalizes the profile (passive
  // finalize, legacy activation, or the active finalize after payment).
  const [completed, setCompleted] = useState(false);
  const [showFullProfile, setShowFullProfile] = useState(false);
  const consentRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCheckoutParam(new URLSearchParams(window.location.search).get("checkout"));
  }, []);

  // "Búsqueda activa": the profile is confirmed only once Select is paid
  // (the introductions consent was recorded just before Stripe). Until then
  // it stays out of the matching pool, never silently turned passive.
  const awaitingSelectPayment =
    !!profile &&
    !profile.meta.onboardingFinalized &&
    !profile.meta.pendingLegacyActivation &&
    profile.meta.requestedService === "select";

  useEffect(() => {
    if (!awaitingSelectPayment || billingLoading || !entitled || activating) return;
    if (profile && getPrerequisiteRedirect(profile, "/member/profile")) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivating(true);
    void (async () => {
      try {
        await finalizeOnboarding(uid);
        mutate((prev) => ({ ...prev, meta: { ...prev.meta, onboardingFinalized: true } }));
        setCompleted(true);
        void memberFetchJson("/api/member/matching/reevaluate", { method: "POST" }).catch(() => {});
      } catch {
        setError("No hemos podido activar tu búsqueda. Recarga la página para intentarlo de nuevo.");
      }
    })();
  }, [awaitingSelectPayment, billingLoading, entitled, activating, profile, uid, mutate]);

  useEffect(() => {
    if (!profile) return;
    const redirect = getPrerequisiteRedirect(profile, "/member/profile");
    if (redirect) router.replace(redirect);
  }, [profile, router]);

  if (!profile) {
    if (profileError) {
      return <IntroductionError message={profileError} onRetry={() => void refreshProfile()} />;
    }
    return <IntroductionLoading />;
  }

  if (getPrerequisiteRedirect(profile, "/member/profile")) {
    return <IntroductionLoading />;
  }

  const finalized = profile.meta.onboardingFinalized;

  async function recordConsent() {
    await memberFetchJson("/api/member/introductions-consent", {
      method: "POST",
      body: JSON.stringify({ introductionsConsent: true }),
    });
  }

  async function choosePassive() {
    if (!consent) {
      setError("Para continuar, confirma que aceptas participar en las introducciones privadas.");
      consentRef.current?.focus();
      return;
    }
    await updateProfileFields(uid, {}, { requestedService: "passive" });
    mutate((prev) => ({ ...prev, meta: { ...prev.meta, requestedService: "passive" } }));
    await handleFinalize();
  }

  async function handleFinalize() {
    if (!profile) return; // defensive only — guarded against above before this closure is ever reachable
    setError(null);
    setSaving(true);
    try {
      if (profile.meta.pendingLegacyActivation) {
        // Legacy-contact activation (Path B): pendingLegacyActivation can
        // ONLY be cleared by this dedicated, independently-re-verifying
        // server endpoint (see claim.ts activateLegacyProfile) — the
        // plain client finalizeOnboarding() write is rejected by
        // firestore.rules for a profile in this state. A refusal here
        // (e.g. legal_not_accepted) should not normally happen, since
        // /introduction/legacy already requires accepting current terms
        // before routing into onboarding at all.
        try {
          await legacyFetchJson("/api/legacy/activate", { method: "POST" });
        } catch (err) {
          const code = (err as Error & { code?: string }).code;
          if (code === "legal_not_accepted") {
            setError("Debes aceptar los términos y la política de privacidad actuales antes de activar tu perfil. Vuelve al enlace de activación que recibiste por email.");
          } else {
            setError("No hemos podido activar tu perfil. Inténtalo de nuevo.");
          }
          return;
        }
        mutate((prev) => ({
          ...prev,
          meta: { ...prev.meta, onboardingFinalized: true, pendingLegacyActivation: false },
        }));
        setCompleted(true);
        void memberFetchJson("/api/member/matching/reevaluate", { method: "POST" }).catch(() => {});
        return;
      }
      if (!consent) {
        setError("Para finalizar, confirma que aceptas participar en las introducciones privadas.");
        consentRef.current?.focus();
        return;
      }
      await memberFetchJson("/api/member/introductions-consent", {
        method: "POST",
        body: JSON.stringify({ introductionsConsent: true }),
      });
      await finalizeOnboarding(uid);
      mutate((prev) => ({ ...prev, meta: { ...prev.meta, onboardingFinalized: true } }));
      setCompleted(true);
      // A member who paid before finishing their profile starts matching
      // now rather than at the next scheduled scan. Best-effort: the scan
      // re-evaluates them anyway, so a failure here changes nothing.
      void memberFetchJson("/api/member/matching/reevaluate", { method: "POST" }).catch(() => {});
    } catch {
      setError("No hemos podido guardar tu perfil. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const sections: SectionInfo[] = [
    // Previously hardcoded `true` — this section is now editable after
    // finalization (see AboutMeEditSection.tsx) and CAN become incomplete
    // again (e.g. hasChildren flipped to true but birth years not yet
    // answered), so this must reflect the same authoritative check the
    // matching engine itself uses, not an assumption that "Sobre ti" is
    // always done once the person is finalized.
    { label: "Sobre ti", complete: isAboutMeComplete(profile), href: "/member/profile/about" },
    {
      label: "Lo que buscas",
      complete: isPreferencesComplete(profile.dealbreakers),
      href: "/member/profile/preferences",
    },
    {
      label: "Fotos",
      complete: isPhotosComplete(profile.photos),
      href: "/member/profile/photos",
    },
    {
      label: "Tu presentación",
      complete: isPresentationComplete(profile.presentation.status),
      href: "/member/profile/presentation",
    },
    {
      label: "Contacto",
      complete: profile.contactPreferences.preferredMethod !== null,
      href: "/member/profile/contact",
    },
  ];

  if (completed && finalized) {
    return <CompletionScreen active={entitled} firstName={profile.visible.firstName} />;
  }

  const selectJourney = profile.meta.requestedService === "select";
  const contactSection = sections[sections.length - 1];

  const consentBox = (
    <label className="flex items-start gap-3 text-left text-[14px] leading-relaxed text-ink">
      <input
        ref={consentRef}
        type="checkbox"
        checked={consent}
        onChange={(e) => {
          setConsent(e.target.checked);
          if (e.target.checked) setError(null);
        }}
        className="mt-1 h-4 w-4 flex-none accent-ink"
      />
      <span>
        Acepto participar en las introducciones privadas de Junto Select: podéis proponer mi perfil a
        personas compatibles, y solo compartiréis mi contacto si los dos aceptamos. He leído los{" "}
        <Link href="/terminos" target="_blank" className={linkClasses}>
          Términos y Condiciones
        </Link>{" "}
        y la{" "}
        <Link href="/privacidad" target="_blank" className={linkClasses}>
          Política de Privacidad
        </Link>
        .
      </span>
    </label>
  );

  const errorNote = error && (
    <p role="alert" className="mt-4 text-sm text-[#8a3b3b]">
      {error}
    </p>
  );

  if (finalized) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col py-14">
        <Link href="/member" className={`text-sm ${linkClasses}`}>
          ← Volver al inicio
        </Link>

        <h1 className="mt-6 font-serif text-[30px] font-normal leading-[1.15] text-ink sm:text-[40px]">Tu perfil</h1>
        <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
          Así te verán las personas con las que Junto Select te presente.
        </p>

        <div className="mt-8">
          <ProfileCard profile={profile} />
        </div>

        {errorNote}

        <div id="editar-perfil" className="mt-14 scroll-mt-10 border-t border-hairline pt-8">
          <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-ink-soft">Editar mi perfil</p>
          <div className="mt-4">
            {sections.map((section) => (
              <Link key={section.label} href={section.href ?? "#"} className="block hover:opacity-70">
                <div className="flex items-center justify-between border-b border-hairline py-4">
                  <span className="text-[15px] text-ink">{section.label}</span>
                  <span className={`text-[13px] ${section.complete ? "text-ink" : "text-ink-soft"}`}>
                    {section.complete ? "Completado" : "Pendiente"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col pb-14 pt-8 sm:pt-12">
      <OnboardingStepper stage={5} fraction={1} selectJourney={selectJourney} />

      <h1 className="font-serif text-[30px] font-normal leading-[1.15] text-ink sm:text-[40px]">
        Así se verá tu perfil
      </h1>
      <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
        Revísalo antes de terminar. Podrás cambiarlo más adelante.
      </p>

      <div className="mt-8">
        {showFullProfile ? <ProfileCard profile={profile} /> : <ProfileSummary profile={profile} />}
        <button
          type="button"
          onClick={() => setShowFullProfile((v) => !v)}
          aria-expanded={showFullProfile}
          className={`mt-3 text-sm ${linkClasses}`}
        >
          {showFullProfile ? "Ver resumen" : "Ver perfil completo"}
        </button>
      </div>

      <div id="editar-perfil" className="mt-10 scroll-mt-10">
        <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-ink-soft">Revisa cada parte</p>
        <div className="mt-2 border-t border-hairline">
          {sections.map((section) => {
            const optional = section === contactSection;
            return (
              <div key={section.label} className="flex items-center justify-between border-b border-hairline py-3.5">
                <span className="text-[15px] text-ink">
                  {section.label}
                  {optional && !section.complete && <span className="ml-2 text-[13px] text-ink-soft">Opcional</span>}
                </span>
                {section.href && (
                  <Link href={section.href} className={`text-[13px] ${linkClasses}`}>
                    {optional && !section.complete ? "Añadir" : "Editar"}
                    <span className="sr-only"> {section.label}</span>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!awaitingSelectPayment && (
        <div className="mt-10">
          {!profile.meta.pendingLegacyActivation && (
            <fieldset className="rounded-md border border-hairline bg-white/60 p-5">
              <legend className="px-1 text-[12px] font-medium uppercase tracking-[0.2em] text-ink-soft">
                Confirmación
              </legend>
              {consentBox}
            </fieldset>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleFinalize}
            className={`${primaryButtonClasses} mt-6 w-full`}
          >
            {saving ? "Guardando…" : "Guardar y finalizar"}
          </button>
          {errorNote}
        </div>
      )}

      {awaitingSelectPayment && (entitled || activating) && (
        <>
          <p role="status" className="mt-10 text-[15px] text-ink-soft">
            Tu membresía está activa. Estamos activando tu búsqueda…
          </p>
          {errorNote}
        </>
      )}

      {awaitingSelectPayment && !entitled && !activating && (
        <div className="mt-12 border-t border-hairline pt-8">
          {checkoutParam === "success" && (
            <p role="status" className="mb-6 rounded-md border border-hairline bg-white/60 p-4 text-[14px] text-ink-soft">
              Estamos confirmando tu pago con Stripe. Esta página se actualizará sola en unos segundos.
            </p>
          )}
          {checkoutParam === "cancel" && (
            <p role="status" className="mb-6 rounded-md border border-hairline bg-white/60 p-4 text-[14px] text-ink-soft">
              Has cancelado el pago. No se te ha cobrado nada. Tu perfil sigue guardado y no se propone a nadie
              hasta que elijas.
            </p>
          )}
          {MEMBERSHIP_SALES_OPEN ? (
            <>
              <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-ink-soft">Membresía Select</p>
              <h2 className="mt-2 font-serif text-[26px] font-normal leading-snug text-ink sm:text-[30px]">Elige tu plan</h2>
              <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
                Tu búsqueda activa empieza en cuanto se confirme el pago. Los tres planes incluyen lo mismo; solo
                cambian la duración y el precio.
              </p>
              <PlanCheckoutForm
                marketEligible={isMarketAvailabilityEligible(profile)}
                returnTo="profile"
                beforeCheckout={recordConsent}
                disabledReason={consent ? null : "Para continuar, marca la casilla de participación."}
                leadingConfirmation={consentBox}
                leadingConfirmed={consent}
              />
            </>
          ) : (
            // Membresía is closed: a profile started on the active journey
            // finishes as a private profile, with the same consent box.
            consentBox
          )}

          <div className={MEMBERSHIP_SALES_OPEN ? "mt-12 border-t border-hairline pt-8" : "mt-8"}>
            {MEMBERSHIP_SALES_OPEN ? (
              <>
                <p className="text-[15px] font-medium text-ink">¿Prefieres empezar sin búsqueda activa?</p>
                <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
                  Tu perfil privado forma parte de la red y podemos proponerte a un miembro Select compatible.
                  Puedes activar la búsqueda más adelante sin perder tu perfil.
                </p>
                <p className="mt-3 max-w-[46ch] text-[14px] leading-relaxed text-ink-soft">
                  Si no eliges ninguna opción, tu perfil queda guardado y no se propone a nadie.
                </p>
              </>
            ) : (
              <p className="max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
                Tu perfil privado formará parte de nuestra red. Si creemos que hay alguien para ti, te lo
                propondremos en privado.
              </p>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => void choosePassive()}
              className={`${secondaryButtonClasses} mt-6 w-full`}
            >
              {saving ? "Guardando…" : "Continuar con mi perfil privado"}
            </button>
            {errorNote}
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact first look at the profile on the review step; the full card is one tap away. */
function ProfileSummary({ profile }: { profile: ProfileDocument }) {
  const v = profile.visible;
  const age = profile.private.birthDate
    ? getAge(profile.private.birthDate.toDate().toISOString().slice(0, 10))
    : null;
  const excerpt = profile.presentation.approvedText ?? "";
  return (
    <div className="flex gap-5 rounded-md border border-hairline bg-white/60 p-4 sm:p-5">
      {profile.photos[0] && (
        <div className="w-[96px] shrink-0 sm:w-[120px]">
          <PrivatePhotoThumbnail path={profile.photos[0]} />
        </div>
      )}
      <div className="min-w-0">
        <p className="font-serif text-[24px] font-light leading-snug text-ink">
          {v.firstName}
          {age ? `, ${age}` : ""}
        </p>
        <p className="mt-1 text-[14px] text-ink-soft">{[v.city, v.profession].filter(Boolean).join(" · ")}</p>
        {excerpt && (
          <p className="mt-3 line-clamp-3 text-[14px] leading-relaxed text-ink-soft">{excerpt}</p>
        )}
      </div>
    </div>
  );
}

/** The moment the profile joins: one clear sentence, what happens next, one way forward. */
function CompletionScreen({ active, firstName }: { active: boolean; firstName: string | null }) {
  const steps = active
    ? [
        "Buscamos personas compatibles contigo.",
        "Recibirás hasta 3 propuestas al mes.",
        "Solo compartimos tu contacto si los dos aceptáis.",
      ]
    : [
        "Si creemos que hay alguien para ti, te lo propondremos en privado.",
        "Solo compartimos tu contacto si los dos aceptáis.",
        "Puedes actualizar tu perfil cuando quieras.",
      ];
  return (
    <div
      data-testid="onboarding-complete"
      className="mx-auto flex w-full max-w-[560px] flex-col py-16 sm:py-24"
    >
      <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-ink-soft">
        {active ? "Búsqueda activa" : "Perfil completado"}
      </p>
      <h1 className="mt-3 font-serif text-[32px] font-light leading-[1.15] text-ink sm:text-[44px]">
        {active
          ? `${firstName ? `${firstName}, tu` : "Tu"} búsqueda activa ha comenzado.`
          : "Tu perfil ya forma parte de la red privada."}
      </h1>
      <ol className="mt-10 space-y-4 border-t border-hairline pt-6">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-4 text-[15px] leading-relaxed text-ink">
            <span className="font-serif text-[18px] text-ink-soft">{`0${i + 1}`}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <Link href="/member" className={`${primaryButtonClasses} mt-10 w-full sm:w-auto sm:self-start`}>
        Ir a mi espacio
      </Link>
    </div>
  );
}
