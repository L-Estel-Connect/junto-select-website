"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Section from "@/components/Section";
import Wordmark from "@/components/Wordmark";
import AuthButtons from "@/components/introduction/AuthButtons";
import ConfirmEmailForLink from "@/components/introduction/ConfirmEmailForLink";
import { useAuth } from "@/lib/firebase/useAuth";
import { signOutUser } from "@/lib/firebase/auth";
import { legacyFetchJson } from "@/lib/legacyImport/legacyFetch";
import { eyebrowClasses, primaryButtonClasses } from "@/lib/styles";

const linkClasses =
  "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

type ClaimState =
  | "ready"
  | "already_activated"
  | "existing_account"
  | "not_found"
  | "error";

/**
 * The Path B entry point — reached via the activation email's link (see
 * emailContent.ts's `legacy_profile_activation` copy) or a direct visit.
 * Always behaves first as an activation LANDING page: a signed-out visit
 * (or a magic-link click) shows the landing copy + sign-in options, never
 * an error, since nobody's identity has been checked yet.
 *
 * Deliberately NEVER calls /api/legacy/claim just because a Firebase
 * session already exists on mount. Whether that session is brand new
 * (just completed a Google popup / magic-link click) or was already
 * sitting in this browser from an earlier visit, the person must
 * explicitly confirm "sí, continuar como {email}" before any claim
 * attempt fires — see the `identityConfirmed` gate below. This replaces
 * the previous behavior of silently attempting a claim for whatever
 * identity happened to already be signed in, which could surface a
 * "no invitation found" error before the visitor ever saw what this page
 * was for or got a chance to choose a different account.
 *
 * Reuses the EXACT SAME Google-popup/magic-link sign-in as normal Path A
 * (AuthButtons/useAuth) — this page adds nothing to authentication itself
 * beyond passing its own return path to the magic link (see AuthButtons'
 * `magicLinkReturnPath` prop and auth.ts's `sendMagicLink`), so a legacy
 * contact's magic link always reopens THIS page, never `/introduction`,
 * and therefore never risks entering normal onboarding (which would
 * create a blank Path A profile) before the legacy claim ever runs.
 */
export default function LegacyActivationPage() {
  const { user, loading, needsEmailForLink, linkError, confirmEmailForLink } = useAuth();
  const router = useRouter();
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [claimState, setClaimState] = useState<ClaimState | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  // Guards against firing the claim request twice (e.g. React Strict
  // Mode's double-invoke) for the SAME confirmed identity — reset
  // whenever the person switches accounts (see handleSwitchAccount).
  const claimStarted = useRef(false);

  useEffect(() => {
    if (loading || !user || !identityConfirmed || claimStarted.current) return;
    claimStarted.current = true;
    let cancelled = false;
    legacyFetchJson<{
      ok: true;
      state: "claimed_pending" | "already_claimed_pending" | "already_activated";
    }>("/api/legacy/claim", { method: "POST" })
      .then((result) => {
        if (cancelled) return;
        setClaimState(result.state === "already_activated" ? "already_activated" : "ready");
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
  }, [loading, user, identityConfirmed]);

  async function handleSwitchAccount() {
    setSwitchingAccount(true);
    try {
      await signOutUser();
    } finally {
      // Once `user` goes back to null the page re-renders as the signed-out
      // landing on its own — these just reset THIS identity's leftover
      // claim state so a subsequent sign-in starts clean.
      setIdentityConfirmed(false);
      claimStarted.current = false;
      setClaimState(null);
      setSwitchingAccount(false);
    }
  }

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

  // ---- Signed out: the activation landing experience, always shown first ----
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
          Activa tu perfil de Junto Select
        </h1>
        <div className="max-w-[46ch] space-y-3 text-[15px] leading-relaxed text-ink-soft">
          <p>
            Hace un tiempo completaste nuestro formulario para formar parte de Junto Select. Hemos
            preparado tu perfil con la información que ya nos compartiste.
          </p>
          <p>
            Actívalo para revisarlo, completar los datos que falten y empezar a recibir propuestas
            seleccionadas para ti.
          </p>
        </div>
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
              <AuthButtons magicLinkReturnPath="/introduction/legacy" />
            </>
          )}
        </div>
        <p className="max-w-[38ch] text-xs leading-relaxed text-ink-soft">
          Utiliza el mismo email con el que completaste tu solicitud.
        </p>
      </Section>
    );
  }

  // ---- Signed in, but not yet explicitly confirmed: never auto-claim ----
  if (!identityConfirmed) {
    return (
      <Section
        as="main"
        size="sm"
        className="flex min-h-[70svh] flex-col items-center justify-center gap-6 py-16 text-center"
      >
        <h1 className="max-w-[26ch] font-serif text-[26px] font-normal leading-snug text-ink">
          Activa tu perfil de Junto Select
        </h1>
        <p className="max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
          Has iniciado sesión como <strong>{user.email}</strong>.
        </p>
        <button
          type="button"
          onClick={() => setIdentityConfirmed(true)}
          className={`${primaryButtonClasses} w-full max-w-[360px]`}
        >
          Continuar como {user.email}
        </button>
        <button
          type="button"
          disabled={switchingAccount}
          onClick={handleSwitchAccount}
          className={`text-sm ${linkClasses}`}
        >
          {switchingAccount ? "Cambiando de cuenta…" : "Usar otra cuenta"}
        </button>
      </Section>
    );
  }

  if (claimState === null) {
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

  if (claimState === "already_activated") {
    return (
      <Section as="main" size="sm" className="flex min-h-[70svh] flex-col items-center justify-center gap-6 py-16 text-center">
        <h1 className="max-w-[26ch] font-serif text-[26px] font-normal leading-snug text-ink">
          Tu perfil ya está activo
        </h1>
        <p className="max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
          Ya activaste tu perfil de Junto Select anteriormente.
        </p>
        <Link href="/member" className={`${primaryButtonClasses} inline-block px-8`}>
          Ir a mi perfil
        </Link>
      </Section>
    );
  }

  if (claimState === "not_found") {
    return (
      <Section as="main" size="sm" className="flex min-h-[70svh] flex-col items-center justify-center gap-6 py-16 text-center">
        <h1 className="max-w-[26ch] font-serif text-[26px] font-normal leading-snug text-ink">
          No hemos encontrado ninguna solicitud con este email
        </h1>
        <p className="max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
          Hemos buscado una invitación pendiente para <strong>{user.email}</strong>, pero no hay ninguna
          coincidencia. Si completaste el formulario con otro email, prueba a iniciar sesión con ese. Si
          crees que es un error, escríbenos y te ayudamos.
        </p>
        <button
          type="button"
          disabled={switchingAccount}
          onClick={handleSwitchAccount}
          className={`${primaryButtonClasses} inline-block px-8`}
        >
          {switchingAccount ? "Cambiando de cuenta…" : "Probar con otro email"}
        </button>
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

  // claimState === "ready" — newly claimed or already claimed by this same
  // uid but not yet activated; both render identically (re-accepting terms
  // here is a harmless idempotent re-write — see acceptLegacyTerms).
  return (
    <Section as="main" size="sm" className="flex min-h-[80svh] flex-col items-center justify-center gap-6 py-16 text-center">
      <div className="space-y-1">
        <p className={eyebrowClasses}>Junto Select</p>
      </div>
      <h1 className="max-w-[26ch] font-serif text-[28px] font-normal leading-snug text-ink sm:text-3xl">
        ¡Hemos encontrado tu perfil!
      </h1>
      <div className="max-w-[46ch] space-y-3 text-[15px] leading-relaxed text-ink-soft">
        <p>Ya hemos recuperado parte de tu información. Revísala y completa los datos que falten para activar tu perfil.</p>
        <p>Tu perfil todavía no está activo y no será visible para nadie hasta que lo actives.</p>
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
