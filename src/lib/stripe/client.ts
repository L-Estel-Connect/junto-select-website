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
  cached = new Stripe(key);
  return cached;
}
