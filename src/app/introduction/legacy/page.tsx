"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Section from "@/components/Section";
import Wordmark from "@/components/Wordmark";
import AuthButtons from "@/components/introduction/AuthButtons";
import ConfirmEmailForLink from "@/components/introduction/ConfirmEmailForLink";
import { useAuth } from "@/lib/firebase/useAuth";
import { legacyFetchJson } from "@/lib/legacyImport/legacyFetch";
import { eyebrowClasses, primaryButtonClasses } from "@/lib/styles";

type ClaimState =
  | "claiming"
  | "ready"
  | "existing_account"
  | "not_found"
  | "error";

/**
 * The Path B entry point — reached only via the activation email's link
 * (see emailContent.ts's `legacy_profile_activation` copy). Reuses the
 * EXACT SAME magic-link/Google sign-in used by normal Path A signups
 * (AuthButtons/useAuth) — this page adds nothing to authentication
 * itself. Once signed in, it calls the claim endpoint (server-verified
 * email only — see /api/legacy/claim) and shows the result; only after
 * the person explicitly clicks through here does anything route into the
 * normal onboarding wizard, which then shows their prefilled answers
 * because the claim endpoint already wrote them to `profiles/{uid}` —
 * this page makes no onboarding-specific UI of its own beyond this
 * one-time welcome/consent step.
 */
export default function LegacyActivationPage() {
  const { user, loading, needsEmailForLink, linkError, confirmEmailForLink } = useAuth();
  const router = useRouter();
  const [claimState, setClaimState] = useState<ClaimState | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  // Guards against firing the claim request twice (e.g. React Strict
  // Mode's double-invoke) — `claimState` itself starts as `null` (the
  // "claiming" display state) and is never synchronously set inside this
  // effect, only from the async continuation below.
  const claimStarted = useRef(false);

  useEffect(() => {
    if (loading || !user || claimStarted.current) return;
    claimStarted.current = true;
    let cancelled = false;
    legacyFetchJson<{ ok: true; alreadyClaimed: boolean }>("/api/legacy/claim", { method: "POST" })
      .then(() => {
        if (!cancelled) setClaimState("ready");
      })
      .catch((err: Error & { code?: string }) => {
        if (cancelled) return;
        if (err.code === "existing_account") setClaimState("existing_account");
        else if (err.code === "not_found") setClaimState("not_found");
        else setClaimState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  async function handleContinue() {
    setAccepting(true);
    setAcceptError(null);
    try {
      await legacyFetchJson("/api/legacy/accept-terms", { method: "POST" });
      router.push("/introduction/onboarding");
    } catch {
      setAcceptError("No hemos podido continuar. Inténtalo de nuevo.");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[70svh] items-center justify-center">
        <p className="text-sm text-ink-soft">Cargando…</p>
      </div>
    );
  }

  if (!user) {
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
        <h1 className="max-w-[26ch] font-serif text-[28px] font-normal leading-snug text-ink sm:text-3xl">
          Tu perfil de Junto Select está listo
        </h1>
        <p className="max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
          Hace un tiempo nos compartiste tus datos. Confirma tu email para revisar lo que ya sabemos y
          completar tu perfil — todavía no está activo ni es visible para nadie.
        </p>
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
      </Section>
    );
  }

  if (claimState === "claiming" || claimState === null) {
    return (
      <div className="flex min-h-[70svh] items-center justify-center">
        <p className="text-sm text-ink-soft">Comprobando tu invitación…</p>
      </div>
    );
  }

  if (claimState === "existing_account") {
    return (
      <Section as="main" size="sm" className="flex min-h-[70svh] flex-col items-center justify-center gap-6 py-16 text-center">
        <h1 className="max-w-[26ch] font-serif text-[26px] font-normal leading-snug text-ink">
          Ya tienes una cuenta en Junto Select
        </h1>
        <p className="max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
          Este email ya está asociado a un perfil activo. Continúa desde ahí — no hemos modificado nada.
        </p>
        <Link href="/introduction" className={`${primaryButtonClasses} inline-block px-8`}>
          Continuar
        </Link>
      </Section>
    );
  }

  if (claimState === "not_found") {
    return (
      <Section as="main" size="sm" className="flex min-h-[70svh] flex-col items-center justify-center gap-6 py-16 text-center">
        <h1 className="max-w-[26ch] font-serif text-[26px] font-normal leading-snug text-ink">
          No hemos encontrado ninguna invitación pendiente
        </h1>
        <p className="max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
          Este enlace ya no corresponde a ninguna invitación activa para este email. Si crees que es un
          error, escríbenos.
        </p>
        <Link href="/introduction" className={`${primaryButtonClasses} inline-block px-8`}>
          Ir a Junto Select
        </Link>
      </Section>
    );
  }

  if (claimState === "error") {
    return (
      <Section as="main" size="sm" className="flex min-h-[70svh] flex-col items-center justify-center gap-6 py-16 text-center">
        <p className="text-[15px] text-ink-soft">No hemos podido comprobar tu invitación. Inténtalo de nuevo en unos minutos.</p>
      </Section>
    );
  }

  return (
    <Section as="main" size="sm" className="flex min-h-[80svh] flex-col items-center justify-center gap-6 py-16 text-center">
      <div className="space-y-1">
        <p className={eyebrowClasses}>Junto Select</p>
      </div>
      <h1 className="max-w-[26ch] font-serif text-[28px] font-normal leading-snug text-ink sm:text-3xl">
        Tu perfil de Junto Select está listo
      </h1>
      <div className="max-w-[46ch] space-y-3 text-[15px] leading-relaxed text-ink-soft">
        <p>Hemos precompletado tu perfil únicamente con la información que ya nos habías facilitado.</p>
        <p>
          Tu perfil todavía no está activo y no será presentado a otros miembros hasta que tú decidas
          revisarlo, completarlo y activarlo.
        </p>
        <p>Podrás revisar y modificar toda la información antes de activar tu perfil.</p>
      </div>

      <button type="button" disabled={accepting} onClick={handleContinue} className={`${primaryButtonClasses} w-full max-w-[360px]`}>
        {accepting ? "Continuando…" : "Revisar y completar mi perfil"}
      </button>
      {acceptError && (
        <p role="alert" className="text-sm text-[#8a3b3b]">
          {acceptError}
        </p>
      )}

      <p className="max-w-[42ch] text-xs leading-relaxed text-ink-soft">
        Al continuar, aceptas nuestros{" "}
        <Link href="/terminos" target="_blank" className="underline decoration-hairline underline-offset-4 hover:text-ink">
          Términos y Condiciones
        </Link>{" "}
        y nuestra{" "}
        <Link href="/privacidad" target="_blank" className="underline decoration-hairline underline-offset-4 hover:text-ink">
          Política de Privacidad
        </Link>
        .
      </p>
    </Section>
  );
}
