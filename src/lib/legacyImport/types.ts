import type { Gender, RelationshipIntention } from "@/lib/introduction/types";

/**
 * "Legacy contact activation" — Path B of the two entry paths into Junto
 * Select (see README). A row from an older, pre-platform interest/profile
 * form is imported into a `legacyImports/{id}` document (never directly
 * into `profiles/{uid}`, since no Firebase Auth account exists yet — see
 * claim.ts). Only once the person authenticates as the SAME verified
 * email and explicitly claims it does a real `profiles/{uid}` document
 * get created, seeded from `prefill` below — from that moment on, the
 * normal `ProfileDocument`/`completion.ts`/matching-eligibility pipeline
 * is the only thing that governs them, identical to a brand-new Path A
 * signup. This module adds exactly three new concepts on top of the
 * existing architecture: the import record itself, a `prefill` shape (a
 * conservative subset of `ProfileDocument` fields safe to pre-populate),
 * and the claim transaction — nothing here is a parallel profile model.
 */

export const LEGACY_IMPORT_SOURCE = "juntoselect_old_form_2026" as const;

/**
 * `imported`: row parsed and written, no email sent yet.
 * `email_queued`: activation email has been queued (queued ≠ sent — see
 * outboundEmails.ts; this only means `queueOutboundEmail` was called).
 * `claimed`: the person authenticated as the matching verified email and
 * a real `profiles/{uid}` was created from `prefill` — onboarding may
 * still be entirely incomplete at this point.
 * `activated`: the claimed profile finished the CURRENT required
 * onboarding through the exact same `completion.ts` logic Path A uses
 * (mirrors `meta.onboardingFinalized`) — recorded here for admin
 * visibility, but never itself read by any eligibility check (the real
 * gate is `ProfileDocument.meta.profileStatus`, computed exactly as for
 * Path A; see eligibility.ts).
 * `collision`: the normalized email already belongs to an existing real
 * Junto Select account at claim time — the existing account is never
 * touched or overwritten (see claim.ts).
 */
export type LegacyImportStatus = "imported" | "email_queued" | "claimed" | "activated" | "collision";

/**
 * The ONLY fields ever written into a new `profiles/{uid}` document at
 * claim time — a conservative subset of `ProfileDocument`, never a
 * separate profile shape. Every field here is independently nullable:
 * `computeImportPlan` (importPlan.ts) leaves a field `null` whenever the
 * old form's answer wasn't semantically equivalent enough to the current
 * field to import safely (see README/report for the full mapping table)
 * — a `null` here is never invented, and the member fills it in like any
 * other missing onboarding answer. Every one of these fields remains
 * fully editable in the normal onboarding wizard/edit screens after
 * claim — this is a PREFILL, never a locked answer.
 */
export interface LegacyPrefillFields {
  firstName: string | null;
  gender: Gender | null;
  profession: string | null;
  heightCm: number | null;
  relationshipIntention: RelationshipIntention | null;
  ageMin: number | null;
  ageMax: number | null;
  /** E.164-ish "+34XXXXXXXXX" — see mapping.ts normalizePhone. Inert until the member opts into a contact method (contactPreferences.preferredMethod/additionalMethods stay unset by default), so storing it here exposes nothing to anyone. */
  phone: string | null;
}

export const emptyLegacyPrefill: LegacyPrefillFields = {
  firstName: null,
  gender: null,
  profession: null,
  heightCm: null,
  relationshipIntention: null,
  ageMin: null,
  ageMax: null,
  phone: null,
};

/**
 * Everything from the old form that did NOT map cleanly to a current
 * field — kept ONLY for admin reference (see labels.ts / the admin legacy
 * list), NEVER copied into any `ProfileDocument` field, NEVER returned
 * from any member-facing or public API.
 *
 * DATA MINIMIZATION: this is deliberately NOT a full mirror of the
 * spreadsheet row. Every field below serves one of exactly two
 * operational purposes — (1) letting an admin verify/debug a specific
 * prefill decision (the `raw*` fields, one per field we actually attempt
 * to map) or (2) a field the original design flagged as useful for admin
 * review (`ageAtImport`, `submittedAt` for dedup/audit). The old form's
 * OTHER free-text answers — qualities valued in a partner, how friends
 * describe them, cultural-background openness, Instagram/LinkedIn, and
 * especially the "no-go" free text (which can contain religion,
 * ethnicity, or other special-category content) — have NO such purpose:
 * they don't feed any current prefill field, so there is nothing to
 * verify or debug, and they are never read, stored, or persisted
 * anywhere by this module. `buildPrefillAndRaw` (importPlan.ts) never
 * even looks at those spreadsheet columns.
 */
export interface LegacyRawFields {
  rawName: string | null;
  ageAtImport: number | null;
  /** Verbatim source values, for admin debugging of a parsing decision — never displayed as if they were current answers. */
  rawHeight: string | null;
  rawAgeRange: string | null;
  rawRelationshipIntention: string | null;
  rawGender: string | null;
  /** ISO string of the old form's own submission timestamp ("Horodateur"), not this import's timestamp. */
  submittedAt: string | null;
}

export const emptyLegacyRaw: LegacyRawFields = {
  rawName: null,
  ageAtImport: null,
  rawHeight: null,
  rawAgeRange: null,
  rawRelationshipIntention: null,
  rawGender: null,
  submittedAt: null,
};

/** Recorded on `legacyImports/{id}` once the person explicitly clicks through the activation welcome screen — see the final report re: the current app's existing legal-acceptance touchpoint (Stripe checkout) not being duplicated as a stronger gate here. */
export interface LegacyActivationConsent {
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: unknown;
}

export interface LegacyImportDocument {
  normalizedEmail: string;
  status: LegacyImportStatus;
  source: typeof LEGACY_IMPORT_SOURCE;
  prefill: LegacyPrefillFields;
  raw: LegacyRawFields;
  /** Parsing warnings from computeImportPlan — admin-only, never member-facing. */
  warnings: string[];
  /** Opaque index into the source spreadsheet — admin debugging only, NEVER exposed in any public/member-facing payload (see importPlan.ts doc comment). */
  sourceRowRef: number;
  claimedUid: string | null;
  claimedPersonId: string | null;
  /** Set only when status === "collision" — the uid of the pre-existing real account this email already belongs to. Never merged/overwritten automatically. */
  collisionUid: string | null;
  activationConsent: LegacyActivationConsent | null;
  importedAt: unknown;
  emailQueuedAt: unknown | null;
  claimedAt: unknown | null;
  activatedAt: unknown | null;
  updatedAt: unknown;
}
