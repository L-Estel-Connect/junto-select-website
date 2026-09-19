import {
  emptyLegacyPrefill,
  emptyLegacyRaw,
  LEGACY_IMPORT_SOURCE,
  type LegacyImportDocument,
  type LegacyPrefillFields,
  type LegacyRawFields,
} from "./types";
import {
  extractFirstName,
  isValidEmailFormat,
  legacyImportId,
  mapGender,
  mapProfession,
  mapRelationshipIntention,
  normalizeEmail,
  normalizeHeightCm,
  normalizePhone,
  parseLegacyAge,
  parsePreferredAgeRange,
  trimToNull,
} from "./mapping";

/**
 * The exact column headers of the source spreadsheet ("junto select
 * contact (1).xlsx", a Google Forms export) this module was built and
 * tested against. `parseRawExcelRow` requires every key here to be
 * present — see its own doc comment for why a header mismatch fails
 * loudly instead of silently misreading a differently-shaped file.
 * (The workbook also has an "Adresse e-mail" column, entirely empty
 * across all rows — dropped here on purpose, see the final report.)
 */
export const HEADER_NAME = "Name / Nombre";
export const HEADER_PROFESSION = "¿A qué te dedicas? What do you do for a living?";
export const HEADER_EMAIL = "Email / Correo";
export const HEADER_PHONE = "Phone  / Teléfono ";
export const HEADER_HEIGHT = "Altura/Height";
export const HEADER_GENDER = " Género/Gender";
export const HEADER_AGE = "Edad/Age";
export const HEADER_RELATIONSHIP_INTENTION =
  "¿Qué tipo de relación estás buscando? What type of relationship are you looking for?";
export const HEADER_AGE_RANGE = "Rango de edad que prefieres / Preferred age range";
export const HEADER_QUALITIES = "¿Qué cualidades valoras más en una persona? / What qualities do you value most in a person?";
export const HEADER_FRIENDS_DESCRIBE = "¿Cómo te describirían tus amigos? / How would your friends describe you?";
export const HEADER_CULTURAL_OPENNESS =
  "¿Estás abierto/a a conocer personas de diferentes contextos culturales? / Are you open to meeting people from different cultural backgrounds?";
export const HEADER_INSTAGRAM_LINKEDIN = "Instagram o LinkedIn (opcional) / Instagram or LinkedIn (optional)";
export const HEADER_NO_GO =
  "¿Hay algún “no quiero” o “no-go” importante para ti en una relación? Is there any important “no-go” for you in a relationship?";
export const HEADER_TIMESTAMP = "Horodateur";

export const EXPECTED_HEADERS = [
  HEADER_TIMESTAMP,
  HEADER_NAME,
  HEADER_PROFESSION,
  HEADER_EMAIL,
  HEADER_PHONE,
  HEADER_HEIGHT,
  HEADER_GENDER,
  HEADER_AGE,
  HEADER_RELATIONSHIP_INTENTION,
  HEADER_AGE_RANGE,
  HEADER_QUALITIES,
  HEADER_FRIENDS_DESCRIBE,
  HEADER_CULTURAL_OPENNESS,
  HEADER_INSTAGRAM_LINKEDIN,
  HEADER_NO_GO,
] as const;

/** One row exactly as read from the spreadsheet — string/number/Date/undefined cell values, nothing normalized yet. */
export type RawExcelRow = Record<string, string | number | Date | undefined>;

function cell(row: RawExcelRow, header: string): string {
  const value = row[header];
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/**
 * Verifies a parsed workbook's header row actually matches
 * `EXPECTED_HEADERS` before any row is processed — a differently-shaped
 * file (renamed/reordered/added/removed columns) must fail loudly here,
 * never be silently misread column-by-column-position.
 */
export function validateHeaders(actualHeaders: string[]): { ok: true } | { ok: false; missing: string[]; unexpected: string[] } {
  // Deliberately an EXACT-match comparison, no trimming: several of this
  // workbook's real headers carry a distinguishing leading/trailing space
  // (see the HEADER_* constants above) — trimming either side here would
  // make an actually-missing header look present.
  const actualSet = new Set(actualHeaders);
  const expectedSet = new Set<string>(EXPECTED_HEADERS);
  const missing = EXPECTED_HEADERS.filter((h) => !actualSet.has(h));
  const unexpected = actualHeaders.filter((h) => h.trim() && h !== "Adresse e-mail" && !expectedSet.has(h));
  if (missing.length === 0) return { ok: true };
  return { ok: false, missing, unexpected };
}

export type ImportRowOutcome = "ready" | "invalid_email" | "duplicate_skipped" | "collision";

export interface ImportPlanRow {
  /** 0-based index into the source rows array — admin-debugging only, never surfaced publicly (see LegacyImportDocument.sourceRowRef). */
  rowIndex: number;
  normalizedEmail: string | null;
  outcome: ImportRowOutcome;
  /** Built only when outcome === "ready" (minus the Firestore-only fields added at write time — see writeImport.ts). */
  record: Omit<
    LegacyImportDocument,
    | "status"
    | "importedAt"
    | "emailQueuedAt"
    | "claimedAt"
    | "activatedAt"
    | "updatedAt"
    | "activationConsent"
    | "claimedUid"
    | "claimedPersonId"
    | "collisionUid"
  > | null;
  warnings: string[];
}

export interface ImportPlanSummary {
  totalRows: number;
  validEmailRows: number;
  readyToImport: number;
  duplicatesSkipped: number;
  invalidOrMissingEmails: number;
  collisions: number;
}

export interface ImportPlan {
  summary: ImportPlanSummary;
  ready: ImportPlanRow[];
  invalidEmail: ImportPlanRow[];
  duplicatesSkipped: ImportPlanRow[];
  collisions: ImportPlanRow[];
  /** Every row, in original order — for a full audit trail alongside the bucketed lists above. */
  allRows: ImportPlanRow[];
}

function buildPrefillAndRaw(row: RawExcelRow): { prefill: LegacyPrefillFields; raw: LegacyRawFields; warnings: string[] } {
  const warnings: string[] = [];
  const prefill: LegacyPrefillFields = { ...emptyLegacyPrefill };
  const raw: LegacyRawFields = { ...emptyLegacyRaw };

  const rawName = cell(row, HEADER_NAME);
  raw.rawName = trimToNull(rawName);
  const nameResult = extractFirstName(rawName);
  prefill.firstName = nameResult.value;
  if (nameResult.warning) warnings.push(nameResult.warning);

  const rawGender = cell(row, HEADER_GENDER);
  raw.rawGender = trimToNull(rawGender);
  if (rawGender) {
    const genderResult = mapGender(rawGender);
    prefill.gender = genderResult.value;
    if (genderResult.warning) warnings.push(genderResult.warning);
  }

  const rawProfession = cell(row, HEADER_PROFESSION);
  if (rawProfession) {
    const professionResult = mapProfession(rawProfession);
    prefill.profession = professionResult.value;
    if (professionResult.warning) warnings.push(professionResult.warning);
  }

  const rawHeight = cell(row, HEADER_HEIGHT);
  raw.rawHeight = trimToNull(rawHeight);
  if (rawHeight) {
    const heightResult = normalizeHeightCm(rawHeight);
    prefill.heightCm = heightResult.value;
    if (heightResult.warning) warnings.push(heightResult.warning);
  }

  const rawIntention = cell(row, HEADER_RELATIONSHIP_INTENTION);
  raw.rawRelationshipIntention = trimToNull(rawIntention);
  if (rawIntention) {
    const intentionResult = mapRelationshipIntention(rawIntention);
    prefill.relationshipIntention = intentionResult.value;
    if (intentionResult.warning) warnings.push(intentionResult.warning);
  }

  const rawAgeRange = cell(row, HEADER_AGE_RANGE);
  raw.rawAgeRange = trimToNull(rawAgeRange);
  if (rawAgeRange) {
    const rangeResult = parsePreferredAgeRange(rawAgeRange);
    prefill.ageMin = rangeResult.ageMin;
    prefill.ageMax = rangeResult.ageMax;
    if (rangeResult.warning) warnings.push(rangeResult.warning);
  }

  const rawPhone = cell(row, HEADER_PHONE);
  if (rawPhone) {
    const phoneResult = normalizePhone(rawPhone);
    prefill.phone = phoneResult.value;
    if (phoneResult.warning) warnings.push(phoneResult.warning);
  }

  const rawAge = cell(row, HEADER_AGE);
  if (rawAge) {
    const ageResult = parseLegacyAge(rawAge);
    raw.ageAtImport = ageResult.value;
    if (ageResult.warning) warnings.push(ageResult.warning);
  }

  // DATA MINIMIZATION: the old form's other free-text columns (qualities
  // valued, friends' description, cultural-background openness,
  // Instagram/LinkedIn, and especially the "no-go" answer — which can
  // contain religion, ethnicity, or other special-category content) are
  // deliberately never read here at all. See LegacyRawFields's own doc
  // comment (types.ts): none of them feed any current prefill field, so
  // there is nothing for an admin to verify/debug by retaining them, and
  // "no-go" specifically must never be persisted anywhere.

  const horodateur = row[HEADER_TIMESTAMP];
  if (horodateur instanceof Date) {
    raw.submittedAt = horodateur.toISOString();
  } else if (typeof horodateur === "string" && horodateur.trim()) {
    const parsed = new Date(horodateur);
    raw.submittedAt = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return { prefill, raw, warnings };
}

function rowTimestamp(row: RawExcelRow): number {
  const horodateur = row[HEADER_TIMESTAMP];
  if (horodateur instanceof Date) return horodateur.getTime();
  if (typeof horodateur === "string") return new Date(horodateur).getTime() || 0;
  return 0;
}

/**
 * Pure computation of what an import run WOULD do — no Firestore access,
 * no side effects, fully unit-testable. `existingAccountEmails` is the
 * set of normalized emails that already belong to a real
 * `profiles/{uid}` document (resolved by the caller, e.g. from Firebase
 * Auth, before calling this) — used only to flag collisions, never to
 * merge or overwrite anything.
 *
 * Deduplication: when the same normalized email appears more than once
 * (a person who resubmitted the old form), only the row with the LATEST
 * "Horodateur" submission timestamp is kept as `ready`; every earlier
 * row for that email is reported under `duplicatesSkipped`, never
 * silently dropped without a trace.
 */
export function computeImportPlan(rows: RawExcelRow[], existingAccountEmails: ReadonlySet<string>): ImportPlan {
  const allRows: ImportPlanRow[] = [];

  const perRow = rows.map((row, rowIndex) => ({
    rowIndex,
    normalizedEmail: normalizeEmail(cell(row, HEADER_EMAIL)),
    timestamp: rowTimestamp(row),
    row,
  }));

  // Latest-Horodateur-wins per normalized email.
  const latestIndexByEmail = new Map<string, number>();
  for (const entry of perRow) {
    if (!entry.normalizedEmail || !isValidEmailFormat(entry.normalizedEmail)) continue;
    const currentBestIndex = latestIndexByEmail.get(entry.normalizedEmail);
    if (currentBestIndex === undefined || entry.timestamp > perRow[currentBestIndex].timestamp) {
      latestIndexByEmail.set(entry.normalizedEmail, entry.rowIndex);
    }
  }

  for (const entry of perRow) {
    const { rowIndex, normalizedEmail, row } = entry;

    if (!normalizedEmail || !isValidEmailFormat(normalizedEmail)) {
      allRows.push({
        rowIndex,
        normalizedEmail,
        outcome: "invalid_email",
        record: null,
        warnings: [`missing or malformed email: "${cell(row, HEADER_EMAIL)}"`],
      });
      continue;
    }

    const isLatestForEmail = latestIndexByEmail.get(normalizedEmail) === rowIndex;
    if (!isLatestForEmail) {
      allRows.push({
        rowIndex,
        normalizedEmail,
        outcome: "duplicate_skipped",
        record: null,
        warnings: [`duplicate submission for ${normalizedEmail} — a later submission from the same email was kept instead`],
      });
      continue;
    }

    if (existingAccountEmails.has(normalizedEmail)) {
      allRows.push({
        rowIndex,
        normalizedEmail,
        outcome: "collision",
        record: null,
        warnings: [`${normalizedEmail} already belongs to an existing Junto Select account — not imported, flagged for admin review`],
      });
      continue;
    }

    const { prefill, raw, warnings } = buildPrefillAndRaw(row);
    allRows.push({
      rowIndex,
      normalizedEmail,
      outcome: "ready",
      record: {
        normalizedEmail,
        source: LEGACY_IMPORT_SOURCE,
        prefill,
        raw,
        warnings,
        sourceRowRef: rowIndex,
      },
      warnings,
    });
  }

  const ready = allRows.filter((r) => r.outcome === "ready");
  const invalidEmail = allRows.filter((r) => r.outcome === "invalid_email");
  const duplicatesSkipped = allRows.filter((r) => r.outcome === "duplicate_skipped");
  const collisions = allRows.filter((r) => r.outcome === "collision");

  return {
    summary: {
      totalRows: rows.length,
      validEmailRows: rows.length - invalidEmail.length,
      readyToImport: ready.length,
      duplicatesSkipped: duplicatesSkipped.length,
      invalidOrMissingEmails: invalidEmail.length,
      collisions: collisions.length,
    },
    ready,
    invalidEmail,
    duplicatesSkipped,
    collisions,
    allRows,
  };
}

export { legacyImportId };
