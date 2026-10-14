"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Section from "@/components/Section";
import Wordmark from "@/components/Wordmark";
import AuthButtons from "@/components/introduction/AuthButtons";
import ConfirmEmailForLink from "@/components/introduction/ConfirmEmailForLink";
import { OnboardingStagesPreview } from "@/components/introduction/OnboardingFrame";
import { useAuth } from "@/lib/firebase/useAuth";
import { signOutUser } from "@/lib/firebase/auth";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { serviceFromParam } from "@/lib/account/route";
import type { RequestedService } from "@/lib/introduction/types";
import { eyebrowClasses, primaryButtonClasses } from "@/lib/styles";
import { DeleteProfileModal } from "@/components/member/SettingsSection";

const linkClasses = "underline decoration-hairline underline-offset-4 hover:text-ink";

/**
 * "Acceder", and the sign-in step of "Elige tu modalidad".
 *
 * Signing in never creates an Introducciones profile. A signed-in person is
 * routed by /api/account/status (finished profile → member area, Select
 * member → membership welcome, unfinished profile → continue it); someone
 * with nothing yet sees "Tu cuenta" and chooses. A profile is created only
 * by an explicit choice (`?modalidad=pasivo|activa` from the Introducciones
 * page, or the button on "Tu cuenta") through /api/account/choose.
 */
export default function IntroductionLandingPage() {
  const { user, loading, needsEmailForLink, linkError, confirmEmailForLink } = useAuth();
  const router = useRouter();

  // Set only when a guard sent someone here because a session they really
  // had lapsed (see lib/account/signInRedirect.ts).
  const [sessionExpired, setSessionExpired] = useState(false);
  // Where to send someone once signed in, when they arrived here from
  // RequireReconnectAuth (`?next=/reconnect/abc123`). Restricted to the
  // `/reconnect/` tree, so this can never become an open redirect.
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [memberNextPath, setMemberNextPath] = useState<string | null>(null);
  const [intent, setIntent] = useState<RequestedService | null>(null);
  const [paramsRead, setParamsRead] = useState(false);
  const [account, setAccount] = useState<{ admin: boolean } | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessionExpired(params.get("session") === "expired");
    const next = params.get("next");
    // A magic link completes in a new tab without the query string, so the
    // chosen service and the member destination are also kept locally.
    const chosen = serviceFromParam(params.get("modalidad"));
    if (chosen) storeIntent(chosen);
    setIntent(chosen ?? readStoredIntent());
    setParamsRead(true);
    if (next && next.startsWith("/reconnect/")) {
      setNextPath(next);
      return;
    }
    const memberNext = isMemberPath(next) ? next : readStoredMemberNext();
    if (memberNext) {
      storeMemberNext(memberNext);
      setMemberNextPath(memberNext);
    }
  }, []);

  useEffect(() => {
    if (!paramsRead || loading || !user) return;
    let cancelled = false;
    async function route() {
      if (nextPath) return router.replace(nextPath);
      if (memberNextPath) {
        storeMemberNext(null);
        return router.replace(memberNextPath);
      }
      try {
        if (intent) {
          const { route } = await memberFetchJson<{ route: string }>("/api/account/choose", {
            method: "POST",
            body: JSON.stringify({ service: intent }),
          });
          storeIntent(null);
          if (!cancelled) router.replace(route);
          return;
        }
        const status = await memberFetchJson<{ route: string | null; admin: boolean }>("/api/account/status");
        if (cancelled) return;
        if (status.route) router.replace(status.route);
        else setAccount({ admin: status.admin });
      } catch {
        if (!cancelled) setRouteError("No hemos podido abrir tu cuenta. Inténtalo de nuevo en unos minutos.");
      }
    }
    void route();
    return () => {
      cancelled = true;
    };
  }, [paramsRead, loading, user, router, nextPath, memberNextPath, intent]);

  async function choosePassive() {
    setRouteError(null);
    try {
      const { route } = await memberFetchJson<{ route: string }>("/api/account/choose", {
        method: "POST",
        body: JSON.stringify({ service: "passive" }),
      });
      router.push(route);
    } catch {
      setRouteError("No hemos podido crear tu perfil. Inténtalo de nuevo en unos minutos.");
    }
  }

  if (user && routeError) {
    return (
      <div className="flex min-h-[70svh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-ink-soft">{routeError}</p>
        <button type="button" onClick={() => window.location.reload()} className={`text-sm ${linkClasses}`}>
          Reintentar
        </button>
      </div>
    );
  }

  if (user && account) {
    return <AccountHome email={user.email} admin={account.admin} onChoosePassive={choosePassive} />;
  }

  if (loading || user) {
    return (
      <div className="flex min-h-[70svh] items-center justify-center">
        <p className="text-sm text-ink-soft">Cargando…</p>
      </div>
    );
  }

  const copy = SIGN_IN_COPY[intent ?? "none"];

  return (
    <Section as="main" size="sm" className="flex min-h-[80svh] flex-col justify-center py-14 sm:py-20">
      <Wordmark className="text-xl text-ink sm:text-2xl" />

      <p className={`${eyebrowClasses} mt-10`}>{copy.eyebrow}</p>
      <h1 className="mt-3 max-w-[22ch] font-serif text-[30px] font-normal leading-[1.15] text-ink sm:text-[40px]">
        {copy.title}
      </h1>
      <p className="mt-4 max-w-[44ch] text-[15px] leading-relaxed text-ink-soft">{copy.text}</p>

      {sessionExpired && (
        <p className="mt-6 max-w-[38ch] text-[13px] text-ink-soft">Tu sesión ha caducado. Vuelve a iniciar sesión.</p>
      )}

      <div className="mt-8 w-full max-w-[400px]">
        {needsEmailForLink ? (
          <ConfirmEmailForLink error={linkError} onConfirm={confirmEmailForLink} />
        ) : (
          <>
            {linkError && (
              <p role="alert" className="mb-4 text-sm text-[#8a3b3b]">
                {linkError}
              </p>
            )}
            {/* If we came here from Reconnect (see nextPath above), the
                magic-link email returns straight to the Reconnect page,
                whose own guard mounts the identical useAuth hook. */}
            <AuthButtons magicLinkReturnPath={nextPath ?? "/introduction"} />
          </>
        )}
      </div>

      {intent && (
        <div className="mt-10 max-w-[400px]">
          <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-ink-soft">Después, cinco pasos</p>
          <div className="mt-3">
            <OnboardingStagesPreview selectJourney={intent === "select"} />
          </div>
        </div>
      )}

      {!intent && (
        <p className="mt-8 max-w-[40ch] text-[13px] leading-relaxed text-ink-soft">
          ¿Solo quieres venir a los encuentros? No necesitas cuenta:{" "}
          <Link href="/unete" className={linkClasses}>
            recibe nuestras invitaciones
          </Link>
          .
        </p>
      )}

      <p className="mt-6 max-w-[44ch] text-xs leading-relaxed text-ink-soft">
        Al continuar, aceptas nuestros{" "}
        <Link href="/terminos" target="_blank" className={linkClasses}>
          Términos y Condiciones
        </Link>{" "}
        y nuestra{" "}
        <Link href="/privacidad" target="_blank" className={linkClasses}>
          Política de Privacidad
        </Link>
        .
      </p>
    </Section>
  );
}

const SIGN_IN_COPY: Record<RequestedService | "none", { eyebrow: string; title: string; text: string }> = {
  none: {
    eyebrow: "Junto Select",
    title: "Accede a tu cuenta",
    text: "Tu perfil privado y tus propuestas, en un solo lugar.",
  },
  passive: {
    eyebrow: "Perfil privado",
    title: "Crea tu perfil privado",
    text: "Identifícate con Google o con tu email. Tu perfil es privado y nunca se publica.",
  },
  select: {
    eyebrow: "Búsqueda activa · Membresía Select",
    title: "Empieza tu búsqueda activa",
    text: "Identifícate con Google o con tu email. Después completas tu perfil privado y, al final, eliges tu plan.",
  },
};

/**
 * "Tu cuenta": a signed-in account with no profile and no membership.
 * Nothing exists yet, so the page only offers the two choices.
 */
function AccountHome({
  email,
  admin,
  onChoosePassive,
}: {
  email: string | null;
  admin: boolean;
  onChoosePassive: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <Section as="main" size="sm" className="flex min-h-[80svh] flex-col justify-center gap-8 py-16">
      <div className="space-y-3">
        <p className={eyebrowClasses}>Tu cuenta</p>
        <h1 className="font-serif text-[30px] font-normal leading-[1.15] text-ink sm:text-[40px]">Hola.</h1>
        <p className="max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
          Tu cuenta aún no tiene un perfil privado. Elige cómo quieres participar; no se crea nada hasta que lo
          elijas.
        </p>
        {email && <p className="break-all text-[13px] text-ink-soft">Has accedido como {email}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-md border border-hairline bg-white/60 p-6">
          <p className={eyebrowClasses}>Perfil privado</p>
          <p className="text-[15px] leading-relaxed text-ink-soft">
            Forma parte de nuestra red privada: si creemos que hay alguien para ti, te lo propondremos en privado.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onChoosePassive();
            }}
            className={`${primaryButtonClasses} mt-auto`}
          >
            {busy ? "Creando…" : "Crear mi perfil privado"}
          </button>
        </div>
        <div className="flex flex-col gap-3 rounded-md border border-hairline bg-white/60 p-6">
          <p className={eyebrowClasses}>Matchmaking privado</p>
          <p className="text-[15px] leading-relaxed text-ink-soft">
            Nuestro equipo busca por ti, te presenta a personas seleccionadas y organiza la primera cita.
          </p>
          <Link href="/matchmaking" className={`mt-auto text-[14px] text-ink ${linkClasses}`}>
            Conocer el matchmaking privado
          </Link>
        </div>
      </div>

      <p className="text-[13px] leading-relaxed text-ink-soft">
        ¿Solo quieres recibir nuestras invitaciones? No necesitas cuenta:{" "}
        <Link href="/unete" className={linkClasses}>
          Recibir invitaciones
        </Link>
        . Si ya las recibes, puedes darte de baja desde el enlace de cada email.
      </p>

      <div className="flex flex-wrap gap-6 border-t border-hairline pt-6 text-[14px] text-ink-soft">
        {admin && (
          <Link href="/admin" className={linkClasses}>
            Panel de administración
          </Link>
        )}
        <button type="button" onClick={() => void signOutUser()} className={linkClasses}>
          Cerrar sesión
        </button>
        <button type="button" onClick={() => setDeleting(true)} className={linkClasses}>
          Eliminar mi cuenta
        </button>
      </div>
      {deleting && (
        <DeleteProfileModal
          onClose={() => setDeleting(false)}
          onDeleted={() => window.location.replace("/perfil-eliminado")}
        />
      )}
    </Section>
  );
}

const MEMBER_NEXT_KEY = "junto_signin_next";
const INTENT_KEY = "junto_signin_service";

function isMemberPath(path: string | null): path is string {
  return !!path && /^\/member(\/[a-z0-9/_-]*)?$/i.test(path) && !path.includes("//");
}

function readStoredMemberNext(): string | null {
  try {
    const stored = window.localStorage.getItem(MEMBER_NEXT_KEY);
    return isMemberPath(stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeMemberNext(path: string | null) {
  try {
    if (path) window.localStorage.setItem(MEMBER_NEXT_KEY, path);
    else window.localStorage.removeItem(MEMBER_NEXT_KEY);
  } catch {
    // Storage unavailable: the in-memory destination still applies.
  }
}

// A choice left behind by someone who never finished signing in should not
// steer a later, unrelated visit, so it expires.
const INTENT_TTL_MS = 2 * 60 * 60 * 1000;

function readStoredIntent(): RequestedService | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(INTENT_KEY) ?? "null") as { s?: string; t?: number } | null;
    if (!stored || typeof stored.t !== "number" || Date.now() - stored.t > INTENT_TTL_MS) return null;
    return stored.s === "passive" || stored.s === "select" ? stored.s : null;
  } catch {
    return null;
  }
}

function storeIntent(service: RequestedService | null) {
  try {
    if (service) window.localStorage.setItem(INTENT_KEY, JSON.stringify({ s: service, t: Date.now() }));
    else window.localStorage.removeItem(INTENT_KEY);
  } catch {
    // Storage unavailable: the in-memory choice still applies.
  }
}
