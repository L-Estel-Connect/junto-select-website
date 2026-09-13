import "server-only";
import type { PlanKey } from "@/lib/billing/plans";

/**
 * The ONLY place a `PlanKey` resolves to a real Stripe Price ID. This is
 * the server-side allowlist that makes price injection structurally
 * impossible: `create-checkout-session` never accepts a Price ID, an
 * amount, or a currency from the client — only one of these three opaque
 * keys — so there is nothing for a tampered request to smuggle in beyond
 * "which of the three fixed plans."
 */
const PRICE_ENV_VAR: Record<PlanKey, string> = {
  monthly: "STRIPE_PRICE_MONTHLY",
  three_month: "STRIPE_PRICE_THREE_MONTH",
  six_month: "STRIPE_PRICE_SIX_MONTH",
};

export function getStripePriceId(planKey: PlanKey): string {
  const envVar = PRICE_ENV_VAR[planKey];
  const priceId = process.env[envVar];
  if (!priceId) {
    throw new Error(`${envVar} is not configured`);
  }
  return priceId;
}

/** Reverse lookup, used only to label a webhook-observed Price ID back to a PlanKey for the Firestore mirror — never for security decisions. */
export function planKeyForPriceId(priceId: string): PlanKey | null {
  for (const [planKey, envVar] of Object.entries(PRICE_ENV_VAR) as [PlanKey, string][]) {
    if (process.env[envVar] === priceId) return planKey;
  }
  return null;
}
