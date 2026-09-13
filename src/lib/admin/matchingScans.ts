import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { DueScanResult } from "@/lib/matching/dueScheduler";

/**
 * One document per invocation of the automatic due-matching scan (see
 * dueScheduler.ts) — the operational answer to "is the scheduler actually
 * running and doing something." Deliberately separate from
 * `matchingCycles` (which now holds only manual/administrative cycles —
 * see matchingCycles.ts): a scan invocation and a member's individual
 * matching-period cycle are different things, and conflating them is what
 * would have made the cycles list unusable at scale. Contains only
 * counts — no member identity, no proposal content.
 */
export interface MatchingScanRecord extends DueScanResult {
  ranAt: unknown;
}

export async function recordMatchingScan(result: DueScanResult): Promise<void> {
  await adminDb.collection("matchingScans").add({
    ...result,
    ranAt: new Date(),
  } satisfies MatchingScanRecord);
}

export interface MatchingScanRow {
  id: string;
  data: MatchingScanRecord;
}

/** Most recent scan invocations, newest first — enough to see whether the scheduler has been running regularly without needing a date-range picker. */
export async function listRecentMatchingScans(limit = 30): Promise<MatchingScanRow[]> {
  const snap = await adminDb.collection("matchingScans").orderBy("ranAt", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as MatchingScanRecord }));
}
