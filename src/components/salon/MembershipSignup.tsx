"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { sendMagicLink, signInWithGoogle, signOutUser } from "@/lib/firebase/auth";
import { useAuth } from "@/lib/firebase/useAuth";
import { PLAN_DISPLAY, isPlanKey, type PlanKey } from "@/lib/billing/plans";
import type { MarketAvailability } from "@/lib/introduction/types";

const PLAN_STORAGE_KEY = "junto_membership_plan";

const MARKET_OPTIONS: { value: MarketAvailability; label: string }[] = [
  { value: "lives_in_market", label: "Vivo en Madrid" },
  { value: "lives_near_market", label: "Vivo cerca de Madrid" },
  { value: "frequent_visitor", label: "No vivo en Madrid, pero estoy allí con frecuencia" },
  { value: "not_regular_in_market", label: "No suelo estar en Madrid" },
];

const ERRORS: Record<string, string> = {
  market_not_available:
    "La Membresía Select está disponible solo en Madrid: necesitas vivir en Madrid, cerca de Madrid o venir con frecuencia. Te avisaremos cuando llegue a tu ciudad.",
  already_active: "Ya tienes una Membresía Select activa.",
  billing_not_configured: "El pago no está disponible en este momento. Inténtalo de nuevo más tarde.",
};

function readPlan(param: string | null): PlanKey | null {
  if (isPlanKey(param)) return param;
  try {
    const stored = window.localStorage.getItem(PLAN_STORAGE_KEY);
    return isPlanKey(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Membership-first path: plan (from /membresia) → account → activation and
 * payment. Account creation reuses the existing Firebase sign-in methods
 * (Google, email link); the magic link returns here. The chosen plan is
 * also kept in localStorage because completing a magic link strips the
 * query string (see useAuth).
 */
export default function MembershipSignup() {
  const params = useSearchParams();
  const { user, loading, needsEmailForLink, linkError, confirmEmailForLink } = useAuth();
  const [plan, setPlan] = useState<PlanKey | null>(null);
  const [planChecked, setPlanChecked] = useState(false);

  useEffect(() => {
    const p = readPlan(params.get("plan"));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlan(p);
    setPlanChecked(true);
    if (p) {
      try {
        window.localStorage.setItem(PLAN_STORAGE_KEY, p);
      } catch {
        // Storage unavailable (private mode): the plan stays in the URL only.
      }
    }
  }, [params]);

  const cancelled = params.get("checkout") === "cancel";

  if (!planChecked || loading) {
    return <p className="muted">Cargando…</p>;
  }

  if (!plan) {
    return (
      <div className="fform">
        <p className="txt">Elige primero tu plan de Membresía Select.</p>
        <Link className="btn btn-tinta" href="/membresia#planes">
          Ver los planes
        </Link>
      </div>
    );
  }

  const display = PLAN_DISPLAY[plan];
  const step = user ? 3 : 2;

  return (
    <div className="fform">
      <ol className="stepper" aria-label="Pasos">
        <li className="done-step">1 · Plan</li>
        <li className={step > 2 ? "done-step" : undefined} aria-current={step === 2 ? "step" : undefined}>
          2 · Tu cuenta
        </li>
        <li aria-current={step === 3 ? "step" : undefined}>3 · Activación y pago</li>
      </ol>

      <div className="summary-card">
        <span className="eyebrow tinto-eyebrow">Membresía Select · {display.label}</span>
        <span className="price">{display.priceEuros} €</span>
        <span className="muted" style={{ fontSize: 14 }}>{display.billingCopy}</span>
        <Link className="link" href="/membresia#planes" style={{ justifySelf: "start", marginTop: 6 }}>
          Cambiar de plan
        </Link>
      </div>

      {cancelled && (
        <p className="note" role="status">
          Has salido del pago sin completarlo. No se ha realizado ningún cargo; puedes retomarlo cuando quieras.
        </p>
      )}

      {user ? (
        <ActivationStep plan={plan} email={user.email} />
      ) : needsEmailForLink ? (
        <ConfirmEmail error={linkError} onConfirm={confirmEmailForLink} />
      ) : (
        <AccountStep plan={plan} linkError={linkError} />
      )}
    </div>
  );
}

function AccountStep({ plan, linkError }: { plan: PlanKey; linkError: string | null }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(linkError);

  async function google() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch {
      setError("No hemos podido iniciar sesión con Google. Inténtalo de nuevo.");
    }
  }

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Introduce un email válido.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendMagicLink(email.trim(), `${window.location.origin}/membresia/alta?plan=${plan}`);
      setSent(true);
    } catch {
      setError("No hemos podido enviar el enlace. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="note" role="status">
        Te hemos enviado un enlace a <strong>{email.trim()}</strong>. Ábrelo en este mismo dispositivo para continuar
        con tu membresía.
      </div>
    );
  }

  return (
    <div className="fform">
      <div>
        <h2 style={{ fontSize: 34 }}>Crea tu cuenta o accede.</h2>
        <p className="muted" style={{ marginTop: 10, fontSize: 15.5, lineHeight: 1.6 }}>
          Tu cuenta es tu acceso privado al club: desde ella gestionas tu membresía y tu perfil de introducciones.
        </p>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="button" className="btn btn-line" onClick={google}>
        Continuar con Google
      </button>
      <form className="fform" onSubmit={sendLink} noValidate style={{ gap: 16 }}>
        <div className="field">
          <label htmlFor="alta-email">O con tu email</label>
          <input
            id="alta-email"
            className="input"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button className="btn btn-tinta" type="submit" disabled={busy}>
          {busy ? "Enviando…" : "Recibir enlace de acceso"}
        </button>
      </form>
    </div>
  );
}

function ConfirmEmail({ error, onConfirm }: { error: string | null; onConfirm: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  return (
    <form
      className="fform"
      onSubmit={(e) => {
        e.preventDefault();
        void onConfirm(email.trim());
      }}
    >
      <p className="txt">Confirma el email con el que pediste el enlace para continuar.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="field">
        <label htmlFor="alta-confirm-email">Email</label>
        <input id="alta-confirm-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <button className="btn btn-tinta" type="submit">
        Continuar
      </button>
    </form>
  );
}

function ActivationStep({ plan, email }: { plan: PlanKey; email: string | null }) {
  const [market, setMarket] = useState<MarketAvailability | "">("");
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [immediate, setImmediate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = market !== "" && market !== "not_regular_in_market" && age && terms && immediate;

  async function pay(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/membership/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          planKey: plan,
          marketAvailability: market,
          ageConfirmed: true,
          termsAccepted: true,
          immediateServiceRequested: true,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (res.ok && body.url) {
        try {
          window.localStorage.removeItem(PLAN_STORAGE_KEY);
        } catch {
          // ignore
        }
        window.location.assign(body.url);
        return;
      }
      setError(ERRORS[body.error ?? ""] ?? "No hemos podido iniciar el pago. Inténtalo de nuevo en unos minutos.");
    } catch {
      setError("No hemos podido iniciar el pago. Inténtalo de nuevo en unos minutos.");
    }
    setBusy(false);
  }

  return (
    <form className="fform" onSubmit={pay} noValidate>
      <p className="muted" style={{ fontSize: 14.5 }}>
        Has accedido como <strong style={{ color: "var(--tinta)" }}>{email}</strong>.{" "}
        <button type="button" onClick={() => void signOutUser()} style={{ border: 0, background: "none", padding: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>
          No soy yo
        </button>
      </p>

      <fieldset className="field">
        <legend>¿Vives en Madrid o estás allí con frecuencia?</legend>
        <p className="hint">La Membresía Select y las introducciones funcionan hoy en Madrid.</p>
        <div className="chips" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          {MARKET_OPTIONS.map((o) => (
            <label className="chip" key={o.value}>
              <input type="radio" name="market" value={o.value} checked={market === o.value} onChange={() => setMarket(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        {market === "not_regular_in_market" && (
          <p className="note" role="alert">
            {ERRORS.market_not_available}{" "}
            <Link href="/unete">Únete a la comunidad</Link> y te avisaremos.
          </p>
        )}
      </fieldset>

      <div className="field">
        <label className="check" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} />
          <span>Confirmo que tengo 35 años o más.</span>
        </label>
        <label className="check" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>
            He leído y acepto los <a href="/terminos" target="_blank">Términos y condiciones</a> y la{" "}
            <a href="/privacidad" target="_blank">Política de privacidad</a>, incluida la renovación automática.
          </span>
        </label>
        <label className="check" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          <input type="checkbox" checked={immediate} onChange={(e) => setImmediate(e.target.checked)} />
          <span>
            Solicito que mi membresía comience inmediatamente. He leído y acepto las condiciones aplicables al
            desistimiento recogidas en los <a href="/terminos" target="_blank">Términos y condiciones</a>.
          </span>
        </label>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {error === ERRORS.already_active && (
        <Link className="link" href="/member/bienvenida">
          Ir a mi área de miembro
        </Link>
      )}

      <button className="btn btn-tinta" type="submit" disabled={!ready || busy}>
        {busy ? "Redirigiendo al pago seguro…" : `Continuar al pago · ${PLAN_DISPLAY[plan].priceEuros} €`}
      </button>
      <p className="hint muted" style={{ fontSize: 13 }}>
        El pago se realiza en Stripe, de forma segura. Después completarás tu perfil privado para activar las
        introducciones.
      </p>
    </form>
  );
}
