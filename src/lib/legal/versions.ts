/**
 * Canonical current legal-document versions, shared by every flow that
 * needs to record "the person accepted THIS version, at THIS time" —
 * previously duplicated as private constants inside
 * create-checkout-session/route.ts; extracted here so the legacy-contact
 * activation flow (src/lib/legacyImport/) can record acceptance of the
 * exact same versions without a second, driftable copy of these strings.
 * Bump either independently — they track separate documents (Terms vs
 * Privacy Policy) that don't necessarily change together.
 */
export const CURRENT_TERMS_VERSION = "2026-09-terminos-v1";
export const CURRENT_PRIVACY_VERSION = "2026-09-privacidad-v1";
