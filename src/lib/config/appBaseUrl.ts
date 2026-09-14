import "server-only";

/**
 * The one validated source of truth for "what is Junto Select's own
 * public browser origin" — used by every server-side redirect target
 * that must send a real browser back to this app (Stripe Checkout/Portal
 * return URLs) and every public SEO surface (metadataBase, canonical,
 * Open Graph url, robots.txt's sitemap reference, sitemap.xml's own
 * URLs).
 *
 * Deliberately NEVER derived from `request.url`: behind Firebase App
 * Hosting's Cloud Run proxy, `new URL(request.url).origin` is not
 * guaranteed to be the real public hostname — this is the confirmed
 * root cause of a real staging bug where the Stripe Customer Portal's
 * `return_url` sent a member's browser to "0.0.0.0", an address no
 * browser can ever reach. There is no per-request signal here that can
 * be trusted instead; a single explicitly configured value is the fix.
 *
 * Migrating to a new public domain (e.g. juntoselect.com) means changing
 * this ONE environment variable — no source file that calls this
 * function should ever need editing for that move.
 */
let cached: string | null = null;

export function getAppBaseUrl(): string {
  if (cached) return cached;

  const raw = process.env.APP_BASE_URL;
  if (!raw || !raw.trim()) {
    throw new Error(
      "APP_BASE_URL is not configured. Set it to Junto Select's own public origin " +
        "(e.g. the App Hosting URL for staging, https://juntoselect.com for production) — " +
        "never derived from the incoming request, which is unreliable behind App Hosting's proxy.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error(`APP_BASE_URL is not a valid URL: "${raw}"`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`APP_BASE_URL must use http or https: "${raw}"`);
  }

  // A bind address, never a real public origin a browser could reach —
  // exactly the class of value that caused the original bug. Rejected
  // even as an explicitly configured value, not just as a fallback.
  if (parsed.hostname === "0.0.0.0") {
    throw new Error(`APP_BASE_URL must be a real public origin, not the bind address "0.0.0.0"`);
  }

  // `.origin` normalizes away any trailing slash/path a misconfigured
  // value might carry ("https://example.com/" -> "https://example.com"),
  // so every call site can safely do `${getAppBaseUrl()}/some/path`.
  cached = parsed.origin;
  return cached;
}
