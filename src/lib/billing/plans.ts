/**
 * The three sellable membership plans — client-safe display data only
 * (price, duration, copy). No Stripe Price ID lives here: a client can
 * read/import this module freely, but choosing what actually gets charged
 * happens exclusively server-side (see stripePlans.ts), keyed by the
 * `PlanKey` below, never by an amount or Price ID the client supplies.
 *
 * Product model (do not change without the user's explicit sign-off —
 * these are the exact commercial terms specified): each plan is a single
 * upfront charge for its full duration, auto-renewing at the same cadence
 * and the same price (Stripe: a recurring Price whose billing interval
 * *is* the plan duration — 1/3/6 months — not three separate monthly
 * installments). There is no 12-month plan.
 */
export type PlanKey = "monthly" | "three_month" | "six_month";

export const PLAN_KEYS: PlanKey[] = ["monthly", "three_month", "six_month"];

export interface PlanDisplay {
  key: PlanKey;
  label: string;
  durationMonths: number;
  priceEuros: number;
  /** Rounded to whole euros — informational only ("equivale a X€/mes"), never used for billing. */
  perMonthEuros: number;
  billingCopy: string;
  highlight: boolean;
}

export const PLAN_DISPLAY: Record<PlanKey, PlanDisplay> = {
  monthly: {
    key: "monthly",
    label: "1 mes",
    durationMonths: 1,
    priceEuros: 49,
    perMonthEuros: 49,
    billingCopy: "49 € ahora, y 49 € cada mes mientras tu membresía esté activa.",
    highlight: false,
  },
  three_month: {
    key: "three_month",
    label: "3 meses",
    durationMonths: 3,
    priceEuros: 129,
    perMonthEuros: 43,
    billingCopy: "129 € ahora por 3 meses, y 129 € cada 3 meses mientras tu membresía esté activa.",
    highlight: true,
  },
  six_month: {
    key: "six_month",
    label: "6 meses",
    durationMonths: 6,
    priceEuros: 234,
    perMonthEuros: 39,
    billingCopy: "234 € ahora por 6 meses, y 234 € cada 6 meses mientras tu membresía esté activa.",
    highlight: false,
  },
};

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && (PLAN_KEYS as string[]).includes(value);
}
