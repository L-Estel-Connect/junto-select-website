"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Section from "@/components/Section";
import Wordmark from "@/components/Wordmark";
import AuthButtons from "@/components/introduction/AuthButtons";
import ConfirmEmailForLink from "@/components/introduction/ConfirmEmailForLink";
import { useAuth } from "@/lib/firebase/useAuth";
import { eyebrowClasses } from "@/lib/styles";

export default function IntroductionLandingPage() {
  const { user, loading, needsEmailForLink, linkError, confirmEmailForLink } =
    useAuth();
  const router = useRouter();

  // Set only when RequireIntroductionAuth/MemberShell redirected here
  // because a previously signed-in session lapsed mid-browse (see those
  // files' `?session=expired` query param) — without this, an expired
  // session bounced someone straight to this landing page with no
  // explanation, which read as "did the site just break?" rather than an
  // expected, normal expiry. Read the same hydration-safe way as
  // PlanSection.tsx's `checkoutParam` (window.location isn't available
  // during server rendering).
  const [sessionExpired, setSessionExpired] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessionExpired(new URLSearchParams(window.location.search).get("session") === "expired");
  }, []);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/introduction/onboarding");
    }
  }, [loading, user, router]);

  if (loading || user) {
    return (
      <div className="flex min-h-[70svh] items-center justify-center">
        <p className="text-sm text-ink-soft">Cargando…</p>
      </div>
    );
  }

  return (
    <Section
      as="main"
      size="sm"
      className="flex min-h-[80svh] flex-col items-center justify-center gap-8 py-16 text-center"
    >
      <div className="space-y-1">
        <p className={eyebrowClasses}>Junto Select</p>
      </div>

      <Wordmark className="text-2xl text-ink sm:text-3xl" />

      <h1 className="max-w-[24ch] font-serif text-[28px] font-normal leading-snug text-ink sm:text-3xl">
        No busques. Deja que te encontremos a alguien.
      </h1>

      <p className="max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
        Junto Select Introduction es un servicio privado de presentaciones
        seleccionadas. Crea tu perfil en unos minutos.
      </p>

      {sessionExpired && (
        <p className="max-w-[38ch] text-[13px] text-ink-soft">
          Tu sesión ha caducado. Vuelve a iniciar sesión.
        </p>
      )}

      <div className="w-full max-w-[360px]">
        {needsEmailForLink ? (
          <ConfirmEmailForLink error={linkError} onConfirm={confirmEmailForLink} />
        ) : (
          <>
            {linkError && (
              <p role="alert" className="mb-4 text-sm text-[#8a3b3b]">
                {linkError}
              </p>
            )}
            <AuthButtons />
          </>
        )}
      </div>

      <p className="max-w-[38ch] text-xs leading-relaxed text-ink-soft">
        Al continuar, aceptas nuestros{" "}
        <Link
          href="/terminos"
          target="_blank"
          className="underline decoration-hairline underline-offset-4 hover:text-ink"
        >
          Términos y Condiciones
        </Link>{" "}
        y nuestra{" "}
        <Link
          href="/privacidad"
          target="_blank"
          className="underline decoration-hairline underline-offset-4 hover:text-ink"
        >
          Política de Privacidad
        </Link>
        , que explican cómo guardamos tu información de forma privada para
        poder ofrecerte presentaciones seleccionadas.
      </p>
    </Section>
  );
}
