"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase/client";
import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { useMemberProfile } from "./useMemberProfile";
import { useBilling } from "@/lib/billing/useBilling";
import { PLAN_DISPLAY, PLAN_KEYS, type PlanKey } from "@/lib/billing/plans";
import { isEntitledStatus, type BillingDocument } from "@/lib/billing/types";

async function authedFetch(path: string, body?: Record<string, unknown>) {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("no_auth");
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await response.json()) as { ok: boolean; url?: string; error?: string };
  if (!response.ok || !data.ok || !data.url) {
    throw new Error(data.error ?? "request_failed");
  }
  return data.url;
}

function formatDate(value: unknown): string | null {
  const ts = value as { toDate?: () => Date } | null | undefined;
  const date = ts?.toDate ? ts.toDate() : null;
  if (!date) return null;
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

const DISCLOSURES = [
  "El pago se realiza por adelantado, por la duración completa del plan elegido (1, 3 o 6 meses).",
  "Tu membresía se renueva automáticamente al finalizar ese periodo, por la misma duración y al mismo precio, hasta que la canceles.",
  "Puedes cancelar en cualquier momento desde «Gestionar mi membresía». La cancelación se hace efectiva al final del periodo ya pagado — no se hacen reembolsos por el tiempo restante.",
  "Una membresía activa te da derecho a recibir hasta 3 presentaciones seleccionadas al mes. No se acumulan si no se usan, y ese límite no aumenta con planes de mayor duración.",
  "Recibir presentaciones no está garantizado incluso con la membresía activa: solo se te presentan personas que cumplen tus requisitos imprescindibles y superan nuestro umbral de calidad. Un mes sin ninguna coincidencia adecuada es un resultado válido.",
  "Junto Select Introduction está disponible únicamente para el mercado de Madrid en esta fase.",
  "Tu perfil debe estar completo (Sobre ti, Fotos y Lo que buscas) para poder recibir presentaciones — la membresía activa por sí sola no lo sustituye.",
  "Los precios incluyen los impuestos aplicables según tu método de pago y ubicación, calculados por Stripe en el momento del cobro.",
  "El pago se procesa de forma segura por Stripe. Junto Select no almacena los datos de tu tarjeta.",
  "Al confirmar el pago aceptas nuestros Términos y condiciones y nuestra Política de privacidad.",
];

function chargeFrequencyLabel(durationMonths: number): string {
  return durationMonths === 1 ? "cada mes" : `cada ${durationMonths} meses`;
}

function PlanCard({
  planKey,
  selected,
  onSelect,
}: {
  planKey: PlanKey;
  selected: boolean;
  onSelect: () => void;
}) {
  const plan = PLAN_DISPLAY[planKey];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full flex-col rounded-2xl border px-5 py-5 text-left transition-colors ${
        selected ? "border-ink bg-ink/[0.03]" : "border-hairline hover:border-ink/40"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-medium text-ink">{plan.label}</span>
        {plan.highlight && (
          <span className="rounded-full bg-rose-dark px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-white">
            Recomendado
          </span>
        )}
      </div>
      <p className="mt-2 font-serif text-[26px] leading-none text-ink">
        {plan.priceEuros} € {chargeFrequencyLabel(plan.durationMonths)}
      </p>
      {plan.durationMonths > 1 && (
        <p className="mt-1 text-[13px] text-ink-soft">Equivale a {plan.perMonthEuros} €/mes</p>
      )}
    </button>
  );
}

function ActiveMembership({
  billing,
  onManage,
  managing,
  manageError,
}: {
  billing: BillingDocument;
  onManage: () => void;
  managing: boolean;
  manageError: string | null;
}) {
  const plan = billing.planKey ? PLAN_DISPLAY[billing.planKey] : null;
  const renewalDate = formatDate(billing.currentPeriodEnd);
  // Three explicit states — never a single generic "Activa" label that
  // hides whether renewal is actually scheduled to happen.
  const estado = billing.cancelAtPeriodEnd && renewalDate ? `Activa hasta ${renewalDate}` : "Activa";

  return (
    <>
      {billing.status === "past_due" && (
        <div className="mt-6 rounded-xl border border-[#8a3b3b]/30 bg-[#8a3b3b]/[0.04] p-4 text-[14px] text-[#8a3b3b]">
          No hemos podido procesar tu último cobro. Stripe volverá a intentarlo automáticamente — revisa que
          tu método de pago esté al día para no perder tu membresía activa.
        </div>
      )}

      <div className="mt-10 border-t border-hairline">
        <div className="flex items-center justify-between border-b border-hairline py-4">
          <span className="text-[15px] text-ink">Plan</span>
          <span className="text-[13px] text-ink-soft">{plan?.label ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between border-b border-hairline py-4">
          <span className="text-[15px] text-ink">Estado</span>
          <span className="text-[13px] text-ink-soft">{estado}</span>
        </div>
        {renewalDate && !billing.cancelAtPeriodEnd && (
          <div className="flex items-center justify-between border-b border-hairline py-4">
            <span className="text-[15px] text-ink">Próxima renovación</span>
            <span className="text-[13px] text-ink-soft">{renewalDate}</span>
          </div>
        )}
      </div>

      {billing.cancelAtPeriodEnd && renewalDate && (
        <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">
          Tu membresía seguirá activa hasta el {renewalDate}. Después, tu perfil volverá automáticamente
          al modo pasivo.
        </p>
      )}

      <button
        type="button"
        onClick={onManage}
        disabled={managing}
        className="mt-10 w-full rounded-full border border-ink px-9 py-4 text-center text-[13px] font-medium uppercase tracking-[0.18em] text-ink transition-opacity hover:bg-ink hover:text-white disabled:opacity-50"
      >
        {managing ? "Abriendo…" : "Gestionar mi membresía"}
      </button>
      {manageError && (
        <p role="alert" className="mt-3 text-[13px] text-[#8a3b3b]">
          {manageError}
        </p>
      )}
      <p className="mt-3 text-[12px] text-ink-soft">
        Se abre el portal seguro de Stripe, donde puedes actualizar tu método de pago, ver tus recibos o
        cancelar la renovación automática.
      </p>
    </>
  );
}

/**
 * Real membership state, backed by `billing/{uid}` (Stripe-derived,
 * webhook-written — see /api/billing/webhook) — no more hardcoded
 * "Perfil pasivo" placeholder. Passive/free members see the three plans
 * and can start a Stripe Checkout; active members see their real plan,
 * renewal date, and a link into the Stripe Customer Portal to manage or
 * cancel. Nothing here ever reads the `?checkout=` query param as proof
 * of payment — it's used only to choose which transient banner to show
 * while the real state (from the Firestore listener above) catches up.
 */
export default function PlanSection({ uid }: { uid: string }) {
  const { ready, error, refresh } = useMemberProfile(uid);
  const { billing, loading: billingLoading, error: billingError } = useBilling(uid);

  // Read via a mount-gated effect, not directly during render: this value
  // depends on `window.location`, which doesn't exist during server
  // rendering — reading it synchronously in render would make the
  // server's output and the client's first hydration pass disagree (the
  // same hydration-mismatch class fixed in DebugOverlay.tsx). This is only
  // ever used to pick which transient banner to show, never as proof of
  // payment — see the file comment above.
  const [checkoutParam, setCheckoutParam] = useState<string | null>(null);
  useEffect(() => {
    // Same justified hydration-safe exception as DebugOverlay.tsx: this
    // MUST run once, unconditionally, after mount, to read client-only
    // `window.location` state without disagreeing with the server's
    // (window-less) render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCheckoutParam(new URLSearchParams(window.location.search).get("checkout"));
  }, []);

  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("three_month");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [immediateServiceRequested, setImmediateServiceRequested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  if (!ready) {
    if (error) return <IntroductionError message={error} onRetry={() => void refresh()} />;
    return <IntroductionLoading />;
  }
  if (billingLoading || !billing) {
    if (billingError) return <IntroductionError message={billingError} onRetry={() => window.location.reload()} />;
    return <IntroductionLoading />;
  }

  const entitled = isEntitledStatus(billing.status);

  async function handleCheckout() {
    setCheckoutError(null);
    if (!termsAccepted) {
      setCheckoutError("Debes aceptar los términos y condiciones para continuar.");
      return;
    }
    if (!immediateServiceRequested) {
      setCheckoutError("Debes confirmar el inicio inmediato del servicio para continuar.");
      return;
    }
    setSubmitting(true);
    try {
      const url = await authedFetch("/api/billing/create-checkout-session", {
        planKey: selectedPlan,
        termsAccepted: true,
        immediateServiceRequested: true,
      });
      window.location.href = url;
    } catch {
      setCheckoutError("No hemos podido iniciar el pago. Inténtalo de nuevo en unos minutos.");
      setSubmitting(false);
    }
  }

  async function handleManage() {
    setManageError(null);
    setSubmitting(true);
    try {
      const url = await authedFetch("/api/billing/create-portal-session");
      window.location.href = url;
    } catch {
      setManageError("No hemos podido abrir la gestión de tu membresía. Inténtalo de nuevo.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-6 py-14 sm:px-0">
      <h1 className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">Mi plan</h1>

      {checkoutParam === "success" && !entitled && (
        <div className="mt-4 rounded-xl border border-hairline bg-white p-4 text-[14px] text-ink-soft">
          Estamos confirmando tu pago con Stripe — esta página se actualizará sola en cuanto se procese,
          normalmente en unos segundos.
        </div>
      )}
      {checkoutParam === "cancel" && (
        <div className="mt-4 rounded-xl border border-hairline bg-white p-4 text-[14px] text-ink-soft">
          Has cancelado el proceso de pago. No se te ha cobrado nada.
        </div>
      )}

      {entitled ? (
        <>
          <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
            Tu membresía Select está activa: recibirás hasta 3 presentaciones seleccionadas al mes,
            siempre que tu perfil siga cumpliendo los requisitos de la bolsa de Madrid.
          </p>
          <ActiveMembership
            billing={billing}
            onManage={handleManage}
            managing={submitting}
            manageError={manageError}
          />
        </>
      ) : (
        <>
          <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
            Formar parte de Junto Select es gratuito: tu perfil permanece en nuestra base privada y puede
            ser considerado como candidatura para las presentaciones de otros miembros. Para recibir tú
            mismo/a hasta 3 presentaciones seleccionadas al mes, activa una membresía Select.
          </p>

          <div className="mt-10 border-t border-hairline">
            <div className="flex items-center justify-between border-b border-hairline py-4">
              <span className="text-[15px] text-ink">Estado</span>
              <span className="text-[13px] text-ink-soft">Perfil pasivo</span>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            {PLAN_KEYS.map((key) => (
              <PlanCard key={key} planKey={key} selected={selectedPlan === key} onSelect={() => setSelectedPlan(key)} />
            ))}
          </div>

          <div className="mt-8">
            <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">
              Antes de continuar
            </p>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-ink-soft">
              {DISCLOSURES.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ink-soft" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <label className="mt-6 flex items-start gap-3 text-[13px] leading-relaxed text-ink">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              He leído y acepto los{" "}
              <a href="/terminos" target="_blank" className="underline decoration-hairline underline-offset-4">
                Términos y condiciones
              </a>{" "}
              y la{" "}
              <a href="/privacidad" target="_blank" className="underline decoration-hairline underline-offset-4">
                Política de privacidad
              </a>
              , incluyendo la renovación automática descrita arriba.
            </span>
          </label>

          <label className="mt-4 flex items-start gap-3 text-[13px] leading-relaxed text-ink">
            <input
              type="checkbox"
              checked={immediateServiceRequested}
              onChange={(e) => setImmediateServiceRequested(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              Solicito expresamente que la prestación de mi membresía y búsqueda activa comience
              inmediatamente, antes de que finalice el plazo legal de desistimiento de 14 días. Entiendo
              que, si desisto después de que el servicio haya comenzado, podré tener que abonar un
              importe proporcional al servicio ya prestado, conforme a los{" "}
              <a href="/terminos" target="_blank" className="underline decoration-hairline underline-offset-4">
                Términos y condiciones
              </a>
              .
            </span>
          </label>

          <div className="mt-6 flex items-center justify-between border-t border-hairline pt-4 text-[14px]">
            <span className="text-ink">Total a pagar ahora</span>
            <span className="font-medium text-ink">{PLAN_DISPLAY[selectedPlan].priceEuros} €</span>
          </div>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={submitting || !termsAccepted || !immediateServiceRequested}
            className="mt-4 w-full rounded-full bg-ink px-9 py-4 text-center text-[13px] font-medium uppercase tracking-[0.18em] text-white transition-opacity disabled:opacity-40"
          >
            {submitting ? "Redirigiendo a Stripe…" : `Continuar al pago — ${PLAN_DISPLAY[selectedPlan].priceEuros} €`}
          </button>
          {checkoutError && (
            <p role="alert" className="mt-3 text-[13px] text-[#8a3b3b]">
              {checkoutError}
            </p>
          )}
          <p className="mt-3 text-[12px] text-ink-soft">
            Serás redirigido/a a Stripe para completar el pago de forma segura. Junto Select nunca ve ni
            almacena los datos de tu tarjeta.
          </p>
        </>
      )}
    </div>
  );
}
