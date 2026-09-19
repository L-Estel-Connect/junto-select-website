import { createHash } from "node:crypto";
import type { Gender, RelationshipIntention } from "@/lib/introduction/types";

/**
 * Pure, framework-agnostic parsers for the legacy Excel import — no
 * Firestore/Next imports, so every one of these is directly unit-testable
 * against the real spreadsheet's actual values (see the audit script and
 * test suite). Every function follows the same rule stated throughout the
 * product spec: ONLY return a value when the old answer's meaning is
 * unambiguous and sufficiently equivalent to the current field — anything
 * else returns `null` plus a human-readable warning, never a guess.
 */

export interface ParseResult<T> {
  value: T | null;
  warning: string | null;
}

// --- Email ------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_RE.test(email);
}

/**
 * Deterministic `legacyImports/{id}` document id from a normalized email —
 * a hash rather than the raw email itself, so the collection's document
 * IDs (visible to anyone with Firestore console/Admin SDK access) don't
 * embed a reversible list of email addresses in plain sight. Any caller
 * that needs to look up a contact by email recomputes the same hash;
 * nothing about this needs to be reversible.
 */
export function legacyImportId(normalizedEmail: string): string {
  return createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 32);
}

// --- Gender -------------------------------------------------------------

const GENDER_MAP: Record<string, Gender> = {
  "Mujer/Woman": "mujer",
  "Hombre/Man": "hombre",
};

export function mapGender(raw: string): ParseResult<Gender> {
  const trimmed = raw.trim();
  const value = GENDER_MAP[trimmed] ?? null;
  return { value, warning: value ? null : `unrecognized gender value: "${raw}"` };
}

// --- Name -----------------------------------------------------------------

/**
 * Takes only the first token of a full name (the current onboarding
 * question asks explicitly for a first name only) — never invents a name
 * that wasn't there, and explicitly refuses a name field that looks like
 * an email address (a real, observed data-entry mistake in this export:
 * someone typed their email into the "Name" field), rather than importing
 * an email address as if it were a first name.
 */
export function extractFirstName(rawName: string): ParseResult<string> {
  const trimmed = rawName.trim();
  if (!trimmed) return { value: null, warning: "empty name" };
  if (trimmed.includes("@")) {
    return { value: null, warning: `name field looks like an email address, not imported: "${trimmed}"` };
  }
  const first = trimmed.split(/\s+/)[0];
  return { value: first, warning: null };
}

// --- Profession -------------------------------------------------------

/** Mirrors aboutMeFields.ts's `profession` step maxLength — a value longer than the current field allows is left unimported rather than silently truncated (truncation could produce a misleading half-sentence). */
const PROFESSION_MAX_LENGTH = 80;

export function mapProfession(raw: string): ParseResult<string> {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, warning: null };
  if (trimmed.length > PROFESSION_MAX_LENGTH) {
    return { value: null, warning: `profession text too long to import as-is (${trimmed.length} chars): "${trimmed}"` };
  }
  return { value: trimmed, warning: null };
}

// --- Height -------------------------------------------------------------

const MIN_HEIGHT_CM = 140;
const MAX_HEIGHT_CM = 220;

function inHeightRange(cm: number): boolean {
  return Number.isFinite(cm) && cm >= MIN_HEIGHT_CM && cm <= MAX_HEIGHT_CM;
}

/**
 * Conservative height normalizer — see the final report for the full
 * catalog of formats found in the real spreadsheet this was built and
 * tested against. Three unambiguous shapes are accepted, tried in this
 * order, each independently range-validated (140-220cm, matching
 * PreferencesSection.tsx's own height-preference bounds) before being
 * accepted — anything that doesn't cleanly match, or matches but falls
 * outside plausible human height, is rejected rather than guessed:
 *
 *  1. An explicit "NNN cm" substring anywhere in the value (handles a
 *     value like "5'8 inches/173 cm" — the person already did the
 *     conversion for us, so we just read it out).
 *  2. A meters-style decimal: a leading 1 or 2, then ONE of the
 *     separator characters people actually used in this data (. , : ’ '),
 *     then 1-2 digits, then an optional unit suffix (m/cm/mm — "mm" here
 *     is read as a labeling typo for "cm", never literal millimeters,
 *     since no plausible height is ever expressed in mm). "1.6" and
 *     "1.60" both mean 1.60m; a lone trailing digit is right-padded
 *     to hundredths, not treated as tenths-of-a-centimeter.
 *  3. A bare 2-3 digit integer, with an optional cm/mm suffix, already
 *     in centimeters.
 *
 *  Anything else (a negative number, a value with extra tokens like
 *  "1,82/ 90", stray punctuation) is rejected.
 */
export function normalizeHeightCm(raw: string | number): ParseResult<number> {
  const original = String(raw).trim();
  if (!original) return { value: null, warning: null };

  // 1. Explicit "NNN cm" mention anywhere in the string.
  const explicitCm = original.match(/(\d{2,3})\s*cm\b/i);
  if (explicitCm) {
    const cm = Number(explicitCm[1]);
    if (inHeightRange(cm)) return { value: cm, warning: null };
  }

  // 2. Meters-style decimal, anchored to the WHOLE string.
  const meters = original.match(/^([12])[.,:’'](\d{1,2})\s*(?:m|cm|mm)?\s*$/);
  if (meters) {
    const wholePart = meters[1];
    const fractionDigits = meters[2].length === 1 ? `${meters[2]}0` : meters[2];
    const cm = Number(`${wholePart}${fractionDigits}`);
    if (inHeightRange(cm)) return { value: cm, warning: null };
  }

  // 3. Bare integer, already centimeters.
  const bareInteger = original.match(/^(\d{2,3})\s*(?:cm|mm)?\s*$/i);
  if (bareInteger) {
    const cm = Number(bareInteger[1]);
    if (inHeightRange(cm)) return { value: cm, warning: null };
  }

  return { value: null, warning: `ambiguous or implausible height value, not imported: "${original}"` };
}

// --- Relationship intention -----------------------------------------------

/**
 * Only the two old-form values with a genuinely equivalent CURRENT enum
 * member are mapped. The other two observed values ("Conocer a alguien y
 * ver qué pasa / Meet someone and see where it goes" and "Algo casual /
 * Casual dating") describe a casual/exploratory stance that has no
 * corresponding value in the current three-option enum
 * (relacion_seria / matrimonio_familia / aun_no_lo_tengo_claro) — mapping
 * either onto "aun_no_lo_tengo_claro" would be inventing an equivalence
 * the person never stated (indecision is not the same thing as wanting
 * something casual), so both are deliberately left unimported.
 */
const RELATIONSHIP_INTENTION_MAP: Record<string, RelationshipIntention> = {
  "Relación seria / Serious relationship": "relacion_seria",
  "No estoy seguro/a / Not sure yet": "aun_no_lo_tengo_claro",
};

export function mapRelationshipIntention(raw: string): ParseResult<RelationshipIntention> {
  const trimmed = raw.trim();
  const value = RELATIONSHIP_INTENTION_MAP[trimmed] ?? null;
  return {
    value,
    warning: value
      ? null
      : `relationship-intention value has no clear current equivalent, not imported: "${raw}"`,
  };
}

// --- Preferred age range ----------------------------------------------

export interface AgeRangeResult {
  ageMin: number | null;
  ageMax: number | null;
  warning: string | null;
}

const AGE_BOUND_MIN = 25;
const AGE_BOUND_MAX = 90;

function plausibleAge(n: number): boolean {
  return Number.isFinite(n) && n >= AGE_BOUND_MIN && n <= AGE_BOUND_MAX;
}

/**
 * Conservative parser for the old form's free-text preferred-age-range
 * answer — see the final report for the exact catalog of formats this was
 * built and tested against (two-sided ranges in several separator styles,
 * one-sided "N+"/"mayores de N"/"till N" bounds, "indiferente", and
 * several genuinely ambiguous shapes that are deliberately left
 * unimported: a bare single number with no operator, "mayor que yo"
 * (relative to the person's own age — importing it would mean deriving a
 * bound from a DIFFERENT field, not reading the stated answer), and a
 * relative "+/- N años" offset).
 */
export function parsePreferredAgeRange(raw: string): AgeRangeResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ageMin: null, ageMax: null, warning: null };

  // No stated preference at all — a real, legitimate answer, not a parse failure.
  if (/indiferente|me da igual/i.test(trimmed)) {
    return { ageMin: null, ageMax: null, warning: null };
  }

  // Relative to the person's own age — cannot be read as an absolute bound
  // without pulling in a different field's value, which is not "reading
  // the stated answer" and is therefore never done here.
  if (/mayor que yo|menor que yo/i.test(trimmed)) {
    return { ageMin: null, ageMax: null, warning: `relative age preference not imported: "${raw}"` };
  }
  if (/^[+\-=~]+\s*\d+\s*(años|years)?\s*$/i.test(trimmed)) {
    return { ageMin: null, ageMax: null, warning: `relative (+/-) age preference not imported: "${raw}"` };
  }

  // Two-sided range: "20-44", "25 - 40", "30_50", "30/45", "40 a 55",
  // "De 35 a 55", "De 48 a 59 años" — optional "De "/"de " prefix, two
  // numbers joined by -, _, /, or the word "a", optional trailing
  // "años"/"years".
  const twoSided = trimmed.match(
    /^(?:de\s+)?(\d{2,3})\s*(?:-|_|\/|a)\s*(\d{2,3})\s*(?:años|years)?\.?\s*$/i,
  );
  if (twoSided) {
    const a = Number(twoSided[1]);
    const b = Number(twoSided[2]);
    if (plausibleAge(a) && plausibleAge(b) && a < b) {
      return { ageMin: a, ageMax: b, warning: null };
    }
    return { ageMin: null, ageMax: null, warning: `inverted or implausible age range, not imported: "${raw}"` };
  }

  // Two bare numbers separated only by whitespace ("58 65") — a very
  // likely missing-separator typo, accepted only when strictly ascending
  // and both plausible; anything else this loose would risk
  // misinterpreting genuinely unrelated text.
  const barePair = trimmed.match(/^(\d{2,3})\s+(\d{2,3})$/);
  if (barePair) {
    const a = Number(barePair[1]);
    const b = Number(barePair[2]);
    if (plausibleAge(a) && plausibleAge(b) && a < b) {
      return { ageMin: a, ageMax: b, warning: null };
    }
    return { ageMin: null, ageMax: null, warning: `unparsed preferred age range, not imported: "${raw}"` };
  }

  // One-sided lower bound: "40+", ">54", "Mayores de 49".
  const plusBound = trimmed.match(/^(\d{2,3})\s*\+\s*$/);
  if (plusBound) {
    const a = Number(plusBound[1]);
    if (plausibleAge(a)) return { ageMin: a, ageMax: null, warning: null };
  }
  const gtBound = trimmed.match(/^>\s*(\d{2,3})\s*$/);
  if (gtBound) {
    const a = Number(gtBound[1]);
    if (plausibleAge(a)) return { ageMin: a, ageMax: null, warning: null };
  }
  const mayoresBound = trimmed.match(/mayores?\s+de\s+(\d{2,3})/i);
  if (mayoresBound) {
    const a = Number(mayoresBound[1]);
    if (plausibleAge(a)) return { ageMin: a, ageMax: null, warning: null };
  }

  // One-sided upper bound: "Till 52", "Hasta 52".
  const tillBound = trimmed.match(/(?:till|hasta)\s+(\d{2,3})/i);
  if (tillBound) {
    const a = Number(tillBound[1]);
    if (plausibleAge(a)) return { ageMin: null, ageMax: a, warning: null };
  }

  // A bare single number with no operator at all ("45", "60") is
  // genuinely ambiguous — could mean a minimum, a maximum, or a target —
  // and is deliberately never guessed.
  if (/^\d{2,3}$/.test(trimmed)) {
    return { ageMin: null, ageMax: null, warning: `ambiguous single-number age preference, not imported: "${raw}"` };
  }

  return { ageMin: null, ageMax: null, warning: `unparsed preferred age range, not imported: "${raw}"` };
}

// --- Phone ----------------------------------------------------------------

/**
 * Normalizes to "+34XXXXXXXXX". Every phone number observed in this
 * dataset is Spanish (9-digit national number, optionally prefixed with
 * "34" or "0034") — this normalizer is deliberately scoped to that single
 * real shape rather than a general international parser, and rejects
 * anything that doesn't reduce to a 9-digit Spanish number starting with
 * 6/7/8/9 (the only valid leading digits for a Spanish phone number).
 */
export function normalizePhone(raw: string | number): ParseResult<string> {
  const digits = String(raw).replace(/\D/g, "");
  let national: string | null = null;
  if (digits.length === 9) national = digits;
  else if (digits.length === 11 && digits.startsWith("34")) national = digits.slice(2);
  else if (digits.length === 13 && digits.startsWith("0034")) national = digits.slice(4);

  if (!national || !/^[6789]\d{8}$/.test(national)) {
    return { value: null, warning: `unrecognized/invalid phone number format, not imported: "${raw}"` };
  }
  return { value: `+34${national}`, warning: null };
}

// --- Legacy age (NEVER a birthDate — see README) ---------------------------

const MIN_PLAUSIBLE_AGE = 18;
const MAX_PLAUSIBLE_AGE = 100;

/**
 * Parses the old form's stated AGE for admin-only legacy reference —
 * NEVER converted into `private.birthDate`. Fabricating a birth date from
 * an age (e.g. defaulting to January 1st) would create a permanently
 * wrong, unverifiable "exact" date masquerading as one the person
 * actually provided; the real birth date must always come from the
 * member themselves, via the same onboarding `birthDate` question every
 * Path A signup answers.
 */
export function parseLegacyAge(raw: string | number): ParseResult<number> {
  const trimmed = String(raw).trim();
  const n = Number(trimmed);
  if (!trimmed || !Number.isFinite(n) || !Number.isInteger(n) || n < MIN_PLAUSIBLE_AGE || n > MAX_PLAUSIBLE_AGE) {
    return { value: null, warning: `unparseable or implausible age, kept as legacy reference only if valid: "${raw}"` };
  }
  return { value: n, warning: null };
}

// --- Plain free text (no transformation, just trim -> null-if-empty) -----

export function trimToNull(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : null;
}
