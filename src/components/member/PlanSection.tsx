"use client";

import { MEMBERSHIP_SALES_OPEN } from "@/lib/billing/membershipSales";
import { useEffect, useState, type ReactNode } from "react";
import { auth } from "@/lib/firebase/client";
import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { useMemberProfile } from "./useMemberProfile";
import { useBilling } from "@/lib/billing/useBilling";
import { PLAN_DISPLAY, PLAN_KEYS, type PlanKey } from "@/lib/billing/plans";
import { isEntitledStatus, type BillingDocument } from "@/lib/billing/types";
import { isMarketAvailabilityEligible } from "@/lib/introduction/completion";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { useMemberQuery } from "@/lib/member/useMemberQuery";
import type { MemberEventBenefitState, MemberEventBenefitView } from "@/lib/eventBenefits/types";
import { primaryButtonClasses } from "@/lib/styles";
import { CONTACT_EMAIL } from "@/lib/site/content";

const MARKET_NOT_AVAILABLE_MESSAGE =
  "Junto Select está disponible actualmente solo para Madrid. Para recibir propuestas, necesitas vivir en Madrid, cerca de Madrid o venir a Madrid con cierta frecuencia. Si tu situación cambia, podrás actualizar esta respuesta más adelante.";

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

function formatEventDate(ymd: string | null): string | null {
  if (!ymd) return null;
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const DISCLOSURES = [
  "Hasta 3 propuestas al mes. Las que no uses no se acumulan.",
  "Como miembro, también recibes un código personal del 20 % por ciclo mensual para un encuentro Junto Select elegible.",
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

/**
 * One event's benefit card — a real, redeemable code + "Comprar entrada
 * con -20%" once `ready`, or a "preparing" placeholder otherwise. No
 * "Código ya utilizado" state exists on purpose: Ticket Tailor's
 * redemption/used state was not verified as reliable enough to surface
 * (see the Ticket Tailor API audit) — showing nothing false is safer than
 * showing an unverified claim.
 */
function EventBenefitCard({
  benefit,
  onRetry,
  retrying,
}: {
  benefit: MemberEventBenefitView;
  onRetry: () => void;
  retrying: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const eventDate = formatEventDate(benefit.eventDate);
  const validUntil = formatDate(benefit.validUntil);

  async function handleCopy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail silently in some browsers/contexts —
      // the code is still selectable/visible text either way.
    }
  }

  return (
    <div className="rounded-2xl border border-hairline bg-white p-5">
      <p className="text-[15px] font-medium text-ink">{benefit.eventLabel}</p>
      {eventDate && <p className="mt-0.5 text-[13px] text-ink-soft">{eventDate}</p>}
      <p className="mt-2 text-[13px] text-ink">{benefit.percentage} % de descuento en una entrada</p>
      {benefit.ready && benefit.code ? (
        <>
          <div className="mt-3 flex items-center gap-3">
            <span className="rounded-md border border-hairline bg-paper px-3 py-2 font-mono text-[15px] tracking-[0.08em] text-ink">
              {benefit.code}
            </span>
            <button
              type="button"
              onClick={() => handleCopy(benefit.code as string)}
              className="text-[12px] font-medium uppercase tracking-[0.1em] text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink"
            >
              {copied ? "Copiado" : "Copiar código"}
            </button>
          </div>
          {validUntil && <p className="mt-2 text-[12px] text-ink-soft">Válido hasta el {validUntil}.</p>}
          {benefit.simulated && (
            <p className="mt-2 text-[12px] text-[#8a3b3b]">
              Código de prueba del entorno de staging: no existe en Ticket Tailor y no funciona al comprar.
            </p>
          )}
          {benefit.checkoutUrl && (
            <a
              href={benefit.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${primaryButtonClasses} mt-4 inline-block`}
            >
              Comprar entrada con -20%
            </a>
          )}
        </>
      ) : benefit.state === "failed" ? (
        <div className="mt-3">
          <p role="alert" className="text-[13px] text-[#8a3b3b]">
            No hemos podido generar tu código todavía. Tu código está reservado: no perderás el beneficio de este
            ciclo.
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-2 text-[12px] font-medium uppercase tracking-[0.1em] text-ink underline decoration-hairline underline-offset-4 disabled:opacity-50"
          >
            {retrying ? "Reintentando…" : "Reintentar"}
          </button>
          <p className="mt-2 text-[12px] text-ink-soft">
            Si sigue sin aparecer, escríbenos a{" "}
            <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-ink-soft">Estamos preparando tu código para este evento. Solo tarda unos segundos.</p>
      )}
    </div>
  );
}

const CLAIM_ERRORS: Record<string, string> = {
  cycle_already_claimed: "Ya has usado el código de este ciclo mensual.",
  event_already_has_code: "Ya tienes un código para este encuentro.",
  event_not_eligible: "Este encuentro ya no está disponible para el beneficio.",
  no_active_cycle: "Tu membresía no tiene un ciclo activo en este momento.",
};

/**
 * "Beneficio de evento" — the member's one 20 % code per monthly cycle,
 * read ONLY from /api/member/event-benefit (the browser never talks to
 * Ticket Tailor or sees its API key). While this cycle's code is unused
 * the member picks the eligible event it's for; the server enforces one
 * per cycle. Codes already held (including any issued before the monthly
 * model) are listed as before.
 */
export function EventBenefitSection({ uid }: { uid: string }) {
  const benefitQuery = useMemberQuery(
    () => memberFetchJson<MemberEventBenefitState>("/api/member/event-benefit"),
    [uid],
  );
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loading = !benefitQuery.data && !benefitQuery.error;
  const benefits = benefitQuery.data?.benefits ?? [];
  const cycle = benefitQuery.data?.cycle ?? null;
  const claimable = benefitQuery.data?.claimableEvents ?? [];
  const nextCycle = cycle ? formatEventDate(cycle.cycleEnd) : null;
  // cycleEnd is exclusive; "hasta el …" names the cycle's last day.
  const lastDay = cycle
    ? formatEventDate(new Date(Date.parse(`${cycle.cycleEnd}T00:00:00Z`) - 86400000).toISOString().slice(0, 10))
    : null;

  // A code still being prepared is re-read a few times, so it appears
  // without a page reload as soon as Ticket Tailor confirms it.
  const preparing = (benefitQuery.data?.benefits ?? []).some((b) => b.state === "preparing");
  const [polls, setPolls] = useState(0);
  useEffect(() => {
    if (!preparing || polls >= 6) return;
    const t = setTimeout(() => {
      setPolls((n) => n + 1);
      benefitQuery.reload();
    }, 4000);
    return () => clearTimeout(t);
  }, [preparing, polls, benefitQuery]);

  // Asking again for the same event returns the same code and retries its
  // activation: it can never create a second code.
  async function handleRetry(ticketTailorEventId: string) {
    setRetryingId(ticketTailorEventId);
    try {
      await memberFetchJson("/api/member/event-benefit", {
        method: "POST",
        body: JSON.stringify({ ticketTailorEventId }),
      });
    } catch {
      // The card keeps showing the failed state and the contact address.
    } finally {
      setRetryingId(null);
      setPolls(0);
      benefitQuery.reload();
    }
  }

  async function handleClaim(ticketTailorEventId: string) {
    setClaimingId(ticketTailorEventId);
    setClaimError(null);
    try {
      await memberFetchJson("/api/member/event-benefit", {
        method: "POST",
        body: JSON.stringify({ ticketTailorEventId }),
      });
    } catch (err) {
      const code = (err as Error & { code?: string }).code ?? (err instanceof Error ? err.message : "");
      setClaimError(CLAIM_ERRORS[code] ?? "No hemos podido generar tu código. Inténtalo de nuevo.");
    } finally {
      setClaimingId(null);
      benefitQuery.reload();
    }
  }

  return (
    <div className="mt-10 border-t border-hairline pt-8">
      <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">Beneficio de evento</p>
      <p className="mt-2 max-w-[46ch] text-[13px] leading-relaxed text-ink-soft">
        Como miembro Select, recibes un código personal del 20 % para utilizar una sola vez por ciclo
        mensual en un encuentro Junto Select elegible. No es acumulable con otros descuentos.
      </p>
      {loading || benefitQuery.error ? (
        <p className="mt-4 text-[14px] text-ink-soft">
          {benefitQuery.error ? "No hemos podido cargar tu beneficio de evento." : "Cargando…"}
        </p>
      ) : (
        <>
          {cycle && !cycle.claimed && (
            <div className="mt-4 rounded-2xl border border-hairline bg-white p-5">
              <p className="text-[15px] font-medium text-ink">Tu código de este ciclo está disponible</p>
              {claimable.length === 0 ? (
                <p className="mt-2 text-[13px] text-ink-soft">
                  Todavía no hay ningún encuentro elegible dentro de tu periodo de membresía. Podrás pedir tu
                  código cuando se publique uno{lastDay ? `, hasta el ${lastDay}` : ""}.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-[13px] text-ink-soft">
                    Elige el encuentro para el que quieres tu código{lastDay ? ` (disponible hasta el ${lastDay})` : ""}.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {claimable.map((event) => (
                      <li key={event.ticketTailorEventId} className="flex items-center justify-between gap-3 border-t border-hairline pt-2">
                        <span className="text-[13px] text-ink">
                          {event.eventLabel}
                          <span className="block text-ink-soft">{formatEventDate(event.eventDate)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleClaim(event.ticketTailorEventId)}
                          disabled={claimingId !== null}
                          className="shrink-0 text-[12px] font-medium uppercase tracking-[0.1em] text-ink underline decoration-hairline underline-offset-4 disabled:opacity-50"
                        >
                          {claimingId === event.ticketTailorEventId ? "Generando…" : "Pedir mi código"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {claimError && (
                <p role="alert" className="mt-3 text-[13px] text-[#8a3b3b]">
                  {claimError}
                </p>
              )}
            </div>
          )}
          {cycle?.claimed && nextCycle && (
            <p className="mt-4 text-[13px] text-ink-soft">
              Ya has pedido el código de este ciclo. El siguiente estará disponible el {nextCycle}.
            </p>
          )}
          {benefits.length > 0 ? (
            <div className="mt-4 space-y-3">
              {benefits.map((benefit) => (
                <EventBenefitCard
                  key={`${benefit.ticketTailorEventId}-${benefit.code ?? "pending"}`}
                  benefit={benefit}
                  onRetry={() => handleRetry(benefit.ticketTailorEventId)}
                  retrying={retryingId === benefit.ticketTailorEventId}
                />
              ))}
            </div>
          ) : (
            !cycle && (
              <p className="mt-4 text-[14px] text-ink-soft">
                Todavía no hay ningún código disponible para tu periodo de membresía actual.
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}

function ActiveMembership({
  uid,
  billing,
  onManage,
  managing,
  manageError,
}: {
  uid: string;
  billing: BillingDocument;
  onManage: () => void;
  managing: boolean;
  manageError: string | null;
}) {
  const plan = billing.planKey ? PLAN_DISPLAY[billing.planKey] : null;
  const renewalDate = formatDate(billing.currentPeriodEnd);

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
          <span className="text-[13px] text-ink-soft">Activa</span>
        </div>
        {renewalDate && (
          <div className="flex items-center justify-between border-b border-hairline py-4">
            <span className="text-[15px] text-ink">{billing.cancelAtPeriodEnd ? "Finaliza el" : "Próxima renovación"}</span>
            <span className="text-[13px] text-ink-soft">{renewalDate}</span>
          </div>
        )}
      </div>

      <EventBenefitSection uid={uid} />

      {billing.cancelAtPeriodEnd ? (
        <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">
          Tu renovación automática está cancelada. Podrás seguir disfrutando de tu membresía hasta el final
          del periodo ya pagado.
        </p>
      ) : (
        <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">
          Puedes cancelar la renovación cuando quieras. Tu membresía seguirá activa hasta el final del
          periodo que ya has pagado.
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
      {!billing.cancelAtPeriodEnd && (
        <button
          type="button"
          onClick={onManage}
          disabled={managing}
          className="mt-3 w-full text-center text-[13px] font-medium uppercase tracking-[0.14em] text-[#8a3b3b] underline decoration-hairline underline-offset-4 transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          Cancelar suscripción
        </button>
      )}
      {manageError && (
        <p role="alert" className="mt-3 text-[13px] text-[#8a3b3b]">
          {manageError}
        </p>
      )}
      <p className="mt-3 text-[12px] text-ink-soft">
        Ambos botones abren el portal seguro de Stripe en una pestaña nueva, donde puedes actualizar tu
        método de pago, ver tus recibos o cancelar la renovación automática. Junto Select permanece abierto
        y se actualizará solo en cuanto confirmes el cambio.
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

/**
 * The three plans, the required confirmations and the button to Stripe.
 * Used on Mi plan and, for "Búsqueda activa", as the last step of the
 * profile (`returnTo: "profile"` brings Stripe back to that step).
 * `beforeCheckout` runs first (e.g. recording the introductions consent).
 */
export function PlanCheckoutForm({
  marketEligible,
  returnTo,
  beforeCheckout,
  disabledReason,
  leadingConfirmation,
  leadingConfirmed,
}: {
  marketEligible: boolean;
  returnTo?: "profile";
  beforeCheckout?: () => Promise<void>;
  disabledReason?: string | null;
  /** An extra required box shown first in "Confirmaciones" (the Introducciones participation consent). */
  leadingConfirmation?: ReactNode;
  leadingConfirmed?: boolean;
}) {
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("three_month");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [immediateServiceRequested, setImmediateServiceRequested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleCheckout() {
    setCheckoutError(null);
    if (!termsAccepted) {
      setCheckoutError("Debes aceptar los términos y condiciones para continuar.");
      return;
    }
    if (!immediateServiceRequested) {
      setCheckoutError("Debes confirmar que quieres empezar ya para continuar.");
      return;
    }
    setSubmitting(true);
    try {
      await beforeCheckout?.();
      const url = await authedFetch("/api/billing/create-checkout-session", {
        planKey: selectedPlan,
        termsAccepted: true,
        immediateServiceRequested: true,
        ...(returnTo ? { returnTo } : {}),
      });
      window.location.href = url;
    } catch (err) {
      setCheckoutError(
        err instanceof Error && err.message === "market_not_available"
          ? MARKET_NOT_AVAILABLE_MESSAGE
          : "No hemos podido iniciar el pago. Inténtalo de nuevo en unos minutos.",
      );
      setSubmitting(false);
    }
  }

  const missingConfirmations =
    (leadingConfirmation && !leadingConfirmed ? 1 : 0) + (termsAccepted ? 0 : 1) + (immediateServiceRequested ? 0 : 1);
  const checkboxLabelClasses = "flex items-start gap-3 text-[14px] leading-relaxed text-ink";

  return (
    <>
      <div className="mt-6">
        <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-ink-soft">Incluye</p>
        <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-ink-soft">
          {DISCLOSURES.map((line) => (
            <li key={line} className="flex gap-3">
              <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[var(--laton,#625952)]" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 space-y-3">
        {PLAN_KEYS.map((key) => (
          <PlanCard key={key} planKey={key} selected={selectedPlan === key} onSelect={() => setSelectedPlan(key)} />
        ))}
      </div>

      <fieldset className="mt-8 space-y-4 rounded-md border border-hairline bg-white/60 p-5">
        <legend className="px-1 text-[12px] font-medium uppercase tracking-[0.2em] text-ink-soft">Confirmaciones</legend>
        {leadingConfirmation}
        <label className={checkboxLabelClasses}>
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
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
            , incluida la renovación automática.
          </span>
        </label>

        <label className={checkboxLabelClasses}>
          <input
            type="checkbox"
            checked={immediateServiceRequested}
            onChange={(e) => setImmediateServiceRequested(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
          />
          <span>
            Solicito que mi membresía y búsqueda activa comiencen inmediatamente. He leído y acepto
            las condiciones aplicables al desistimiento recogidas en los{" "}
            <a href="/terminos" target="_blank" className="underline decoration-hairline underline-offset-4">
              Términos y condiciones
            </a>
            .
          </span>
        </label>
      </fieldset>

      <div className="mt-6 flex items-center justify-between border-t border-hairline pt-4 text-[15px]">
        <span className="text-ink">Total a pagar ahora</span>
        <span className="font-medium text-ink">{PLAN_DISPLAY[selectedPlan].priceEuros} €</span>
      </div>

      {!marketEligible && (
        <p role="alert" className="mt-4 text-[13px] leading-relaxed text-[#8a3b3b]">
          {MARKET_NOT_AVAILABLE_MESSAGE}
        </p>
      )}

      <button
        type="button"
        onClick={handleCheckout}
        disabled={submitting || !termsAccepted || !immediateServiceRequested || !marketEligible || !!disabledReason}
        className={`${primaryButtonClasses} mt-4 w-full`}
      >
        {submitting ? "Redirigiendo a Stripe…" : `Continuar al pago — ${PLAN_DISPLAY[selectedPlan].priceEuros} €`}
      </button>
      {!checkoutError && missingConfirmations > 0 && (
        <p className="mt-2 text-center text-[13px] text-ink-soft">
          {missingConfirmations === 1 ? "Falta 1 confirmación." : `Faltan ${missingConfirmations} confirmaciones.`}
        </p>
      )}
      {disabledReason && !checkoutError && missingConfirmations === 0 && (
        <p className="mt-2 text-center text-[13px] text-ink-soft">{disabledReason}</p>
      )}
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
  );
}

export default function PlanSection({ uid }: { uid: string }) {
  const { billing, loading: billingLoading, error: billingError } = useBilling(uid);
  // A Select member manages their membership here even without a finished
  // introductions profile (membership benefits never require one).
  const { profile, ready, error, refresh } = useMemberProfile(uid, {
    allowUnfinished: billingLoading ? null : !!billing && isEntitledStatus(billing.status),
  });

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

  const [submitting, setSubmitting] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  if (!ready) {
    if (error) return <IntroductionError message={error} onRetry={() => void refresh()} />;
    return <IntroductionLoading />;
  }
  if (billingLoading || !billing) {
    if (billingError) return <IntroductionError message={billingError} onRetry={() => window.location.reload()} />;
    return <IntroductionLoading />;
  }

  const entitled = isEntitledStatus(billing.status);
  const marketEligible = profile ? isMarketAvailabilityEligible(profile) : true;

  async function handleManage() {
    setManageError(null);
    setSubmitting(true);
    // Opened synchronously, before the async fetch below, so it still
    // counts as a direct response to the click (some browsers block
    // `window.open` calls made after an `await`) — then pointed at the
    // real portal URL once it's fetched, keeping Junto Select open in the
    // original tab. Deliberately NOT passing "noopener"/"noreferrer" here:
    // either one makes window.open() return null even when the tab opens
    // successfully (there's no way to tell that apart from a real
    // popup-block), which is what previously sent the browser into the
    // "blocked" fallback below and navigated THIS tab to Stripe instead.
    // `newTab.opener = null` right after achieves the same
    // reverse-tabnabbing protection using the reference we already have.
    const newTab = window.open("", "_blank");
    try {
      const url = await authedFetch("/api/billing/create-portal-session");
      if (newTab) {
        newTab.opener = null;
        newTab.location.href = url;
      } else {
        // A real popup block (newTab is only null here now) — same-tab
        // redirect so the action still works.
        window.location.href = url;
      }
    } catch {
      newTab?.close();
      setManageError("No hemos podido abrir la gestión de tu membresía. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col py-14">
      <h1 className="font-serif text-[30px] font-normal leading-[1.15] text-ink sm:text-[40px]">Mi plan</h1>

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
          {profile?.meta.onboardingFinalized ? (
            <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
              Tu membresía está activa: Junto Select está buscando por ti y recibirás hasta 3 propuestas
              al mes, siempre que encontremos perfiles compatibles con tus criterios en Madrid.
            </p>
          ) : (
            <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
              Tu membresía está activa. Tu 20 % en un encuentro al mes ya está disponible. Si quieres
              introducciones privadas,{" "}
              <a href="/member/bienvenida" className="underline decoration-hairline underline-offset-4">
                completa tu perfil privado
              </a>{" "}
              cuando quieras: la búsqueda empieza en cuanto esté completo.
            </p>
          )}
          {profile?.meta.onboardingFinalized && !marketEligible && (
            <div className="mt-4 rounded-xl border border-hairline bg-white p-4 text-[14px] text-ink-soft">
              Tus propuestas están en pausa porque Junto Select está disponible actualmente solo para
              Madrid. Actualiza tu disponibilidad en{" "}
              <a href="/member/profile/about" className="underline decoration-hairline underline-offset-4">
                Sobre ti
              </a>{" "}
              cuando vuelvas a estar en Madrid con regularidad — tu membresía y tu historial no se ven
              afectados.
            </div>
          )}
          <ActiveMembership
            uid={uid}
            billing={billing}
            onManage={handleManage}
            managing={submitting}
            manageError={manageError}
          />
        </>
      ) : !MEMBERSHIP_SALES_OPEN ? (
        // Membresía is closed to new subscriptions: nothing to buy here.
        <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
          Tu perfil privado forma parte de nuestra red. Si prefieres que busquemos por ti, conoce nuestro{" "}
          <a href="/matchmaking" className="underline decoration-hairline underline-offset-4">
            matchmaking privado
          </a>
          .
        </p>
      ) : (
        <>
          <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
            Tu perfil privado forma parte de la red y podemos proponerlo a miembros Select
            compatibles. Con la Membresía Select, además, buscamos activamente por ti.
          </p>

          <div className="mt-10 border-t border-hairline">
            <div className="flex items-center justify-between border-b border-hairline py-4">
              <span className="text-[15px] text-ink">Estado</span>
              <span className="text-[13px] text-ink-soft">No activa</span>
            </div>
          </div>

          <PlanCheckoutForm marketEligible={marketEligible} />
        </>
      )}
    </div>
  );
}
