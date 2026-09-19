import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { OutboundEmailDocument } from "@/lib/notifications/outboundEmails";
import type { ImportPlan } from "./importPlan";
import { legacyImportId } from "./mapping";
import type { LegacyImportDocument } from "./types";

/**
 * Deliberately takes an injected `Firestore` instance rather than
 * importing the app's own `adminDb` singleton (@/lib/firebase/admin,
 * which starts with `import "server-only"`) — this module is the one
 * place in `legacyImport/` that must be callable from BOTH the Next.js
 * server runtime and a standalone Node script (scripts/legacy-import.mts)
 * run outside it, where the `server-only` marker package throws
 * unconditionally (it only resolves to its no-op stub under a bundler
 * that understands the "react-server" export condition, e.g. Next's
 * Server Component build — never under plain `node`/`tsx`). Every OTHER
 * legacyImport module (claim.ts, used only by real API routes) keeps the
 * normal `server-only` guard; this one trades that guard for an explicit
 * parameter instead, since standalone-script callability is a real
 * requirement here, not an oversight.
 *
 * These are the ONLY two functions in this module that write to
 * Firestore — deliberately separated from `computeImportPlan` (pure,
 * testable without any IO) so a dry run never accidentally touches the
 * database no matter how this module evolves. NEITHER is called anywhere
 * in this change (see the final report: real import and real email
 * queueing are both intentionally deferred to a separate, explicitly-
 * approved run) — the only caller is scripts/legacy-import.mts, and only
 * when explicitly run with `--write`.
 */

/**
 * Idempotent: `legacyImportId(normalizedEmail)` is deterministic, so
 * re-running the same plan twice never creates a duplicate document — an
 * existing doc for that id is left completely untouched (never
 * overwritten with a fresher parse of the same row), which is also what
 * protects a contact that has since progressed (claimed/activated) from
 * ever being reset back to "imported" by a later re-run.
 */
export async function executeImportPlan(db: Firestore, plan: ImportPlan): Promise<{ written: number; skippedExisting: number }> {
  let written = 0;
  let skippedExisting = 0;

  for (const row of plan.ready) {
    if (!row.record) continue;
    const id = legacyImportId(row.record.normalizedEmail);
    const ref = db.doc(`legacyImports/${id}`);

    const created = await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) return false;
      const now = FieldValue.serverTimestamp();
      const doc: LegacyImportDocument = {
        ...row.record!,
        status: "imported",
        claimedUid: null,
        claimedPersonId: null,
        collisionUid: null,
        activationConsent: null,
        importedAt: now,
        emailQueuedAt: null,
        claimedAt: null,
        activatedAt: null,
        updatedAt: now,
      };
      tx.set(ref, doc);
      return true;
    });

    if (!created) {
      skippedExisting++;
      continue;
    }
    written++;
  }

  return { written, skippedExisting };
}

/**
 * Queues the activation email for every `legacyImports` doc still in
 * status "imported" — separate from `executeImportPlan` so importing the
 * data and deciding to actually notify people are two distinct, equally
 * explicit actions. Writes directly to `outboundEmails` in exactly the
 * same shape `queueOutboundEmail` (outboundEmails.ts) would, with the
 * same deterministic-id idempotency contract (a doc already present at
 * `legacy_activation_{id}` is left untouched) — duplicated here rather
 * than imported only because that helper also transitively pulls in the
 * server-only `adminDb` singleton; see this module's own top doc comment.
 */
export async function queueActivationEmails(db: Firestore): Promise<{ queued: number }> {
  const snap = await db.collection("legacyImports").where("status", "==", "imported").get();
  let queued = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as LegacyImportDocument;
    const emailRef = db.collection("outboundEmails").doc(`legacy_activation_${doc.id}`);
    const existing = await emailRef.get();
    if (!existing.exists) {
      const email: OutboundEmailDocument = {
        type: "legacy_profile_activation",
        status: "pending",
        uid: null,
        email: data.normalizedEmail,
        data: { firstName: data.prefill.firstName, legacyImportId: doc.id },
        createdAt: new Date(),
        attempts: 0,
        attemptedAt: null,
        sentAt: null,
        lastError: null,
        providerMessageId: null,
      };
      await emailRef.set(email);
    }
    await doc.ref.update({
      status: "email_queued",
      emailQueuedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    queued++;
  }
  return { queued };
}
