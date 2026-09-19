#!/usr/bin/env -S npx tsx
/**
 * Legacy-contact import tool — parses the old Junto Select interest/
 * profile form export and reports (dry run) or performs (--write) the
 * import into `legacyImports/{id}`. See src/lib/legacyImport/ for the
 * shared, unit-tested mapping/planning logic this script is a thin CLI
 * wrapper around; this file itself contains no parsing/mapping logic.
 *
 * Usage:
 *   npx tsx scripts/legacy-import.mts <path-to-xlsx>                 # dry run (default, safe)
 *   npx tsx scripts/legacy-import.mts <path-to-xlsx> --write --yes-i-understand-this-writes-to-firebase
 *                                                                     # real import — see the two required flags below
 *   npx tsx scripts/legacy-import.mts <path-to-xlsx> --write --yes-i-understand-this-writes-to-firebase --send-emails
 *                                                                     # also queues (never sends) the activation email for every newly-imported row
 *
 * Write mode requires ADC/emulator env vars exactly like any other
 * Admin-SDK code in this app (FIRESTORE_EMULATOR_HOST for local testing,
 * or real Google Application Default Credentials in a real environment)
 * — this script never invents its own auth mechanism.
 *
 * `--write` alone is refused: the second flag
 * (`--yes-i-understand-this-writes-to-firebase`) exists so this can never
 * be triggered by a copy-pasted half-remembered command. There is no
 * flag that also sends real email — `--send-emails` only ever calls
 * `queueOutboundEmail`-equivalent writes; actually dispatching queued
 * mail is exclusively `sendPendingOutboundEmails` (the existing
 * scheduled worker), never this script.
 *
 * PROJECT GUARD: before any write, this script independently resolves
 * the Admin SDK's ACTUAL target project id and aborts unless it is
 * exactly `select-dev-508407` (below). This is deliberately not just "ask
 * the operator to double check" — it's a hard, unconditional `process.exit`
 * with no override flag, so a wrong `GCLOUD_PROJECT`/ADC context (e.g. a
 * shell still pointed at a different Firebase project from earlier work)
 * can never result in writing legacy contacts into the wrong project.
 */
const REQUIRED_PROJECT_ID = "select-dev-508407";
import { existsSync } from "node:fs";
import { getApps, getApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import ExcelJS from "exceljs";
import { computeImportPlan, validateHeaders, type RawExcelRow } from "../src/lib/legacyImport/importPlan";
import { executeImportPlan, queueActivationEmails } from "../src/lib/legacyImport/writeImport";

async function readWorkbook(path: string): Promise<{ headers: string[]; rows: RawExcelRow[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("workbook has no sheets");

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    // Deliberately NOT trimmed — several of this workbook's real headers
    // carry a distinguishing leading/trailing space (see importPlan.ts's
    // HEADER_* constants), and trimming here would make `validateHeaders`
    // silently fail to recognize them.
    headers[colNumber - 1] = String(cell.value ?? "");
  });

  const rows: RawExcelRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;
    const record: RawExcelRow = {};
    let hasAnyValue = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const cellValue = row.getCell(index + 1).value;
      if (cellValue === null || cellValue === undefined) return;
      hasAnyValue = true;
      if (cellValue instanceof Date) record[header] = cellValue;
      else if (typeof cellValue === "object" && "text" in (cellValue as unknown as Record<string, unknown>)) {
        record[header] = String((cellValue as unknown as { text: unknown }).text);
      } else if (typeof cellValue === "object" && "result" in (cellValue as unknown as Record<string, unknown>)) {
        record[header] = String((cellValue as unknown as { result: unknown }).result);
      } else {
        record[header] = cellValue as string | number;
      }
    });
    if (hasAnyValue) rows.push(record);
  }

  return { headers, rows };
}

function printSummary(plan: ReturnType<typeof computeImportPlan>) {
  console.log("\n=== Legacy import — dry run summary ===");
  console.log(`Total rows:                ${plan.summary.totalRows}`);
  console.log(`Valid-format email rows:   ${plan.summary.validEmailRows}`);
  console.log(`Ready to import:           ${plan.summary.readyToImport}`);
  console.log(`Duplicates skipped:        ${plan.summary.duplicatesSkipped}`);
  console.log(`Invalid/missing emails:    ${plan.summary.invalidOrMissingEmails}`);
  console.log(`Existing-account collisions: ${plan.summary.collisions}`);

  const totalWarnings = plan.ready.reduce((sum, r) => sum + r.warnings.length, 0);
  console.log(`\nParsing warnings on ready rows: ${totalWarnings}`);
  for (const row of plan.ready) {
    if (row.warnings.length === 0) continue;
    console.log(`  row ${row.rowIndex} (${row.normalizedEmail}):`);
    for (const w of row.warnings) console.log(`    - ${w}`);
  }

  if (plan.invalidEmail.length > 0) {
    console.log(`\nInvalid/missing email rows:`);
    for (const row of plan.invalidEmail) console.log(`  row ${row.rowIndex}: ${row.warnings.join("; ")}`);
  }
  if (plan.duplicatesSkipped.length > 0) {
    console.log(`\nDuplicate rows skipped (later submission kept instead):`);
    for (const row of plan.duplicatesSkipped) console.log(`  row ${row.rowIndex}: ${row.normalizedEmail}`);
  }
  if (plan.collisions.length > 0) {
    console.log(`\nExisting-account collisions (never overwritten):`);
    for (const row of plan.collisions) console.log(`  row ${row.rowIndex}: ${row.normalizedEmail}`);
  }
}

async function loadExistingAccountEmails(db: FirebaseFirestore.Firestore): Promise<Set<string>> {
  // Every existing profile's account email lives on Firebase Auth, not on
  // the profile document itself — resolving that for every profile would
  // mean one Auth lookup per row, which doesn't scale and isn't needed
  // for a dry run. Collision detection against Firebase Auth directly
  // happens for real at CLAIM time (claim.ts checks `profiles/{uid}`
  // for the AUTHENTICATED uid, which is exactly correct and needs no
  // precomputed set at all) — this dry-run-time set is a best-effort,
  // additional early warning only, built from `users/{uid}.email`
  // (the mirror `ensureUserDocument` writes on every sign-in), which is
  // complete for anyone who has ever signed in.
  const snap = await db.collection("users").get();
  const emails = new Set<string>();
  snap.docs.forEach((d) => {
    const email = d.data().email as string | undefined;
    if (email) emails.add(email.trim().toLowerCase());
  });
  return emails;
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith("--"));
  const write = args.includes("--write");
  const confirmed = args.includes("--yes-i-understand-this-writes-to-firebase");
  const sendEmails = args.includes("--send-emails");

  if (!filePath) {
    console.error("Usage: npx tsx scripts/legacy-import.mts <path-to-xlsx> [--write --yes-i-understand-this-writes-to-firebase] [--send-emails]");
    process.exit(1);
  }
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  if (write && !confirmed) {
    console.error("--write requires --yes-i-understand-this-writes-to-firebase as well. Refusing to run.");
    process.exit(1);
  }

  const { headers, rows } = await readWorkbook(filePath);
  const headerCheck = validateHeaders(headers);
  if (!headerCheck.ok) {
    console.error("This workbook's headers don't match what this tool was built for — refusing to guess column meanings.");
    console.error("Missing expected headers:", headerCheck.missing);
    if (headerCheck.unexpected.length > 0) console.error("Unexpected headers present:", headerCheck.unexpected);
    process.exit(1);
  }

  let existingAccountEmails = new Set<string>();
  let db: FirebaseFirestore.Firestore | null = null;
  let resolvedProjectId: string | null = null;
  try {
    const app = getApps().length ? getApp() : initializeApp();
    resolvedProjectId = app.options.projectId ?? process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? null;
    db = getFirestore(app);
    existingAccountEmails = await loadExistingAccountEmails(db);
  } catch (error) {
    console.warn(
      "Could not reach Firestore to check for existing-account collisions (no ADC/emulator configured?) " +
        "— proceeding with an EMPTY existing-accounts set. Collisions will still be caught for real at claim " +
        "time regardless. Error:",
      error instanceof Error ? error.message : error,
    );
  }

  console.log(`\nResolved Firebase/Admin SDK project: ${resolvedProjectId ?? "(could not be determined)"}`);

  const plan = computeImportPlan(rows, existingAccountEmails);
  printSummary(plan);

  if (!write) {
    console.log("\nDry run only — nothing was written. Pass --write --yes-i-understand-this-writes-to-firebase to actually import.");
    return;
  }

  if (!db) {
    console.error("\nCannot write: no Firestore connection was established.");
    process.exit(1);
  }

  // PROJECT GUARD — see the module doc comment above. Unconditional, no
  // override flag: refuses to write anywhere except exactly the
  // authorized Junto Select dev/staging project.
  if (resolvedProjectId !== REQUIRED_PROJECT_ID) {
    console.error(
      `\nABORTING WRITE: resolved project is "${resolvedProjectId ?? "unknown"}", ` +
        `but this script may only write to "${REQUIRED_PROJECT_ID}". ` +
        `Set GCLOUD_PROJECT=${REQUIRED_PROJECT_ID} (and matching Admin SDK credentials) and try again.`,
    );
    process.exit(1);
  }

  console.log(`\n=== WRITE MODE (project verified: ${resolvedProjectId}) ===`);
  const writeResult = await executeImportPlan(db, plan);
  console.log(`Written: ${writeResult.written}, skipped (already existed): ${writeResult.skippedExisting}`);

  if (sendEmails) {
    const emailResult = await queueActivationEmails(db);
    console.log(`Activation emails queued (NOT sent — see sendPendingOutboundEmails): ${emailResult.queued}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
