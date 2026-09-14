import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getAppBaseUrl } from "@/lib/config/appBaseUrl";
import { getTransactionalSenderIdentity, sendTransactionalEmail } from "./brevoTransactional";
import { buildEmailContent } from "./emailContent";
import type { OutboundEmailDocument } from "./outboundEmails";

/** Never load an unbounded queue into memory in one invocation. */
const BATCH_LIMIT = 100;

/**
 * How long a "sending" claim is honored before a later invocation is
 * allowed to reclaim it — the same crash-recovery idiom already used by
 * the matching engine's memberRun claims (see dueScheduler.ts): a worker
 * that crashed mid-send must not leave a document stuck "sending"
 * forever, but two genuinely concurrent invocations must not both send
 * the same email either.
 */
const STALE_SENDING_MS = 10 * 60 * 1000;

export interface SendOutboundEmailsResult {
  candidates: number;
  sent: number;
  failed: number;
  skipped: number;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

/**
 * `doc.email` (captured inline before an account deletion) always wins
 * when present; otherwise resolve through Firebase Auth by uid — see
 * OutboundEmailDocument's own field docs for why. Never throws: a
 * lookup failure (e.g. the user was since deleted with no email
 * captured) is reported as "no recipient", not a crash.
 */
async function resolveRecipientEmail(doc: OutboundEmailDocument): Promise<string | null> {
  if (doc.email) return doc.email;
  if (!doc.uid) return null;
  try {
    const user = await adminAuth.getUser(doc.uid);
    return user.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Drains the outboundEmails queue: "pending", "failed" (retryable), and
 * any "sending" document whose claim has gone stale — never a document
 * already "sent". Fails the WHOLE batch immediately, before touching any
 * queue document, if the Brevo sender identity or APP_BASE_URL isn't
 * configured — a global configuration problem must never look like "N
 * emails failed to send" scattered across individual documents; it
 * should surface as one clear, loud failure instead.
 *
 * Idempotent under concurrent/duplicate invocations: each candidate is
 * claimed via a transaction (read current status, skip if already
 * "sent" or genuinely in-flight elsewhere, otherwise atomically mark
 * "sending" before the real Brevo call happens outside the transaction)
 * — the same claim-then-act pattern the matching engine's memberRun
 * uses for the identical reason.
 */
export async function sendPendingOutboundEmails(now: Date = new Date()): Promise<SendOutboundEmailsResult> {
  // Fail fast, globally, before any Firestore read — see doc comment.
  getTransactionalSenderIdentity();
  const appBaseUrl = getAppBaseUrl();

  const staleThreshold = new Date(now.getTime() - STALE_SENDING_MS);

  const [pendingSnap, failedSnap, staleSendingSnap] = await Promise.all([
    adminDb.collection("outboundEmails").where("status", "==", "pending").limit(BATCH_LIMIT).get(),
    adminDb.collection("outboundEmails").where("status", "==", "failed").limit(BATCH_LIMIT).get(),
    adminDb
      .collection("outboundEmails")
      .where("status", "==", "sending")
      .where("attemptedAt", "<=", staleThreshold)
      .limit(BATCH_LIMIT)
      .get(),
  ]);

  const seen = new Set<string>();
  const candidates = [...pendingSnap.docs, ...failedSnap.docs, ...staleSendingSnap.docs].filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const docSnap of candidates) {
    const ref = docSnap.ref;

    const claimed = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const current = snap.data() as OutboundEmailDocument;
      if (current.status === "sent") return null; // already finished — never re-send
      if (current.status === "sending") {
        const attemptedAt = toDate(current.attemptedAt);
        // Still within the claim window -> another invocation genuinely
        // owns this one right now; only a STALE claim is reclaimable.
        if (attemptedAt && attemptedAt.getTime() > staleThreshold.getTime()) return null;
      }
      tx.update(ref, {
        status: "sending",
        attemptedAt: FieldValue.serverTimestamp(),
        attempts: FieldValue.increment(1),
      });
      return current;
    });

    if (!claimed) {
      skipped++;
      continue;
    }

    const recipientEmail = await resolveRecipientEmail(claimed);
    if (!recipientEmail) {
      await ref.update({ status: "failed", lastError: "no_recipient_email" });
      failed++;
      continue;
    }

    const content = buildEmailContent(claimed.type, claimed.data, appBaseUrl);

    try {
      const result = await sendTransactionalEmail({
        to: { email: recipientEmail },
        subject: content.subject,
        textContent: content.textContent,
      });
      await ref.update({
        status: "sent",
        sentAt: FieldValue.serverTimestamp(),
        providerMessageId: result.messageId,
        lastError: null,
      });
      sent++;
    } catch (error) {
      // Never deleted, never left stuck "sending" — always retryable on
      // the next invocation. The error message alone is stored, never a
      // raw response body that could carry the recipient's own address
      // back into logs.
      await ref.update({
        status: "failed",
        lastError: error instanceof Error ? error.message : String(error),
      });
      failed++;
    }
  }

  return { candidates: candidates.length, sent, failed, skipped };
}
