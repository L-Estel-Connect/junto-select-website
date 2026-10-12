import "server-only";
import Stripe from "stripe";

/**
 * A function, not an eagerly-evaluated constant — mirrors
 * `getAdminStorageBucket()` in `src/lib/firebase/admin.ts`: `next build`
 * imports every route module to collect its config, which would otherwise
 * construct a `Stripe` client (and throw on a missing key) at build time,
 * long before any real request and before secrets are available in this
 * sandbox. Deferring construction to first actual use avoids that, and
 * every call site already runs inside a request handler.
 */
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  // No explicit apiVersion pin: let the SDK use the version it ships
  // bundled with (matches this package's own type definitions), rather
  // than risk pinning to a literal that drifts from what this SDK version
  // actually supports.
  cached = new Stripe(key, localMockConfig(key));
  return cached;
}

/**
 * Local testing only: points the SDK at a local Stripe stand-in when
 * `STRIPE_LOCAL_MOCK_URL` is set (e.g. http://127.0.0.1:12111). Refused
 * unless the key is a test key, so a live key can never be routed
 * anywhere but Stripe. Unset in apphosting.yaml, so production is
 * unaffected.
 */
function localMockConfig(key: string): Stripe.StripeConfig | undefined {
  const raw = process.env.STRIPE_LOCAL_MOCK_URL;
  if (!raw) return undefined;
  if (!key.startsWith("sk_test_")) {
    throw new Error("STRIPE_LOCAL_MOCK_URL requires a Stripe test key");
  }
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: url.port || (url.protocol === "https:" ? "443" : "80"),
    protocol: url.protocol === "https:" ? "https" : "http",
  };
}
