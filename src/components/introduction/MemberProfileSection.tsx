"use client";

import { useEffect, useState } from "react";
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
import { primaryButtonClasses } from "@/lib/styles";
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
        void memberFetchJson("/api/member/matching/reevaluate", { method: "POST" }).catch(() => {});
        return;
      }
      if (!consent) {
        setError("Para finalizar, confirma que aceptas participar en las introducciones privadas.");
        return;
      }
      await memberFetchJson("/api/member/introductions-consent", {
        method: "POST",
        body: JSON.stringify({ introductionsConsent: true }),
      });
      await finalizeOnboarding(uid);
      mutate((prev) => ({ ...prev, meta: { ...prev.meta, onboardingFinalized: true } }));
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

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-6 py-14 sm:px-0">
      <Link href="/member" className={`text-sm ${linkClasses}`}>
        ← Volver a mi perfil
      </Link>

      <h1 className="mt-6 font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        {finalized ? "Tu perfil" : "Así se verá tu perfil"}
      </h1>
      <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
        {finalized
          ? "Así te verán las personas con las que Junto Select te presente."
          : "Revísalo antes de terminar. Podrás actualizar tu información más adelante."}
      </p>

      <div className="mt-8">
        <ProfileCard profile={profile} />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-[#8a3b3b]">
          {error}
        </p>
      )}

      {!finalized && !profile.meta.pendingLegacyActivation && (
        <label className="mt-8 flex items-start gap-3 text-left text-[14px] leading-relaxed text-ink-soft">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
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
      )}

      {!finalized && !awaitingSelectPayment && (
        <button
          type="button"
          disabled={saving}
          onClick={handleFinalize}
          className={`${primaryButtonClasses} mt-8 w-full`}
        >
          {saving ? "Guardando…" : "Guardar y finalizar"}
        </button>
      )}

      {awaitingSelectPayment && (entitled || activating) && (
        <p role="status" className="mt-8 text-[15px] text-ink-soft">
          Tu membresía está activa. Estamos activando tu búsqueda…
        </p>
      )}

      {awaitingSelectPayment && !entitled && !activating && (
        <div className="mt-10 border-t border-hairline pt-8">
          {checkoutParam === "success" && (
            <p role="status" className="mb-6 rounded-xl border border-hairline bg-white p-4 text-[14px] text-ink-soft">
              Estamos confirmando tu pago con Stripe. Esta página se actualizará sola en unos segundos.
            </p>
          )}
          {checkoutParam === "cancel" && (
            <p role="status" className="mb-6 rounded-xl border border-hairline bg-white p-4 text-[14px] text-ink-soft">
              Has cancelado el pago. No se te ha cobrado nada. Tu perfil sigue guardado y no se propone a nadie
              hasta que elijas.
            </p>
          )}
          <p className="text-[12px] uppercase tracking-[0.22em] text-ink-soft">Último paso · Membresía Select</p>
          <h2 className="mt-2 font-serif text-[24px] font-normal leading-snug text-ink">Elige tu plan</h2>
          <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
            Tu búsqueda activa empieza en cuanto se confirme el pago. Los tres planes incluyen lo mismo; solo
            cambian la duración y el precio.
          </p>
          <PlanCheckoutForm
            marketEligible={isMarketAvailabilityEligible(profile)}
            returnTo="profile"
            beforeCheckout={recordConsent}
            disabledReason={consent ? null : "Para continuar, marca la casilla de participación de arriba."}
          />

          <div className="mt-12 border-t border-hairline pt-8">
            <p className="font-serif text-[20px] leading-snug text-ink">¿Prefieres no pagar ahora?</p>
            <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
              Puedes formar parte de nuestra red privada sin coste, como perfil pasivo: podemos proponerte a un
              miembro Select compatible, pero sin búsqueda activa por nuestra parte. Puedes pasar a Select más
              adelante sin perder tu perfil.
            </p>
            <p className="mt-3 max-w-[46ch] text-[14px] leading-relaxed text-ink-soft">
              Si no eliges ninguna opción, tu perfil queda guardado y no se propone a nadie.
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={() => void choosePassive()}
              className="mt-6 inline-flex w-full items-center justify-center rounded-full border border-ink/30 px-9 py-4 text-[13px] font-medium uppercase tracking-[0.18em] text-ink transition-colors duration-200 hover:border-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Quedarme como perfil pasivo, sin coste"}
            </button>
          </div>
        </div>
      )}

      <div id="editar-perfil" className="mt-14 scroll-mt-10 border-t border-hairline pt-8">
        <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">
          Editar mi perfil
        </p>
        <div className="mt-4">
          {sections.map((section) => {
            const row = (
              <div className="flex items-center justify-between border-b border-hairline py-4">
                <span className="text-[15px] text-ink">{section.label}</span>
                <span
                  className={`text-[13px] ${section.complete ? "text-ink" : "text-ink-soft"}`}
                >
                  {section.complete ? "Completado" : "Pendiente"}
                </span>
              </div>
            );
            return section.href ? (
              <Link key={section.label} href={section.href} className="block hover:opacity-70">
                {row}
              </Link>
            ) : (
              <div key={section.label}>{row}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
