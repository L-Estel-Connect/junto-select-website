import "server-only";
import { adminDb } from "@/lib/firebase/admin";

/**
 * Read-only operational diagnostic — see README "Matching period vs.
 * billing renewal": an `active_search` member's own matching-period
 * anchor/due-date fields (`meta.matchingAnchorAt`, `meta.nextMatchingDueAt`)
 * are written ONLY by the Stripe webhook (see billing/webhook/route.ts's
 * `syncSubscription`). A member missing either one is invisible to the
 * due-scan (dueScheduler.ts queries `nextMatchingDueAt <= now`, and
 * Firestore's range filter never matches a genuinely absent field) — they
 * would never receive another matching period again, silently, with
 * nothing else surfacing it. This never mutates data or invents a missing
 * anchor; it only reports who is affected so a human can decide what (if
 * anything) to do — e.g. re-syncing from Stripe for that member.
 */
export interface MatchingHealthIssue {
  uid: string;
  firstName: string;
  missingFields: Array<"matchingAnchorAt" | "nextMatchingDueAt">;
}

export async function findActiveSearchMembersMissingSchedulingFields(): Promise<
  MatchingHealthIssue[]
> {
  const snap = await adminDb
    .collection("profiles")
    .where("meta.searchStatus", "==", "active_search")
    .get();

  const issues: MatchingHealthIssue[] = [];
  for (const doc of snap.docs) {
    const meta = doc.data().meta ?? {};
    const missingFields: MatchingHealthIssue["missingFields"] = [];
    if (meta.matchingAnchorAt == null) missingFields.push("matchingAnchorAt");
    if (meta.nextMatchingDueAt == null) missingFields.push("nextMatchingDueAt");
    if (missingFields.length > 0) {
      issues.push({
        uid: doc.id,
        firstName: doc.data().visible?.firstName ?? "",
        missingFields,
      });
    }
  }
  return issues;
}
