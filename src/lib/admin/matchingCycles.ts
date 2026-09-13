import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { MatchingCycleDocument, MemberRunDocument } from "@/lib/matching/types";

/**
 * Lists manual/administrative cycles only (dry_run, allowlist,
 * limited_live, production) — a small, human-triggered set, safe to read
 * in full and browse one by one. `member_period` cycles (one per member
 * per matching period, from the automatic per-member-anniversary
 * scheduler — see dueScheduler.ts) are deliberately excluded: at even
 * moderate scale there would be many hundreds of these per day, which
 * would both make this page useless to a human (one row per member) and
 * turn this into an ever-growing full-collection read. The `!=` filter
 * excludes them at the query level, not just from the display, so this
 * stays cheap regardless of how many member_period cycles accumulate.
 * See "Matching runs" (matchingScans.ts) for observing the automatic
 * scheduler's health instead — a per-scan-invocation summary, not
 * per-member-cycle detail.
 */
export async function listCycles(): Promise<MatchingCycleDocument[]> {
  const snap = await adminDb.collection("matchingCycles").where("mode", "!=", "member_period").get();
  const cycles = snap.docs.map((d) => d.data() as MatchingCycleDocument);
  return cycles.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

function toMillis(ts: unknown): number {
  const t = ts as { toMillis?: () => number } | null;
  return t?.toMillis ? t.toMillis() : 0;
}

export async function getCycle(cycleId: string): Promise<MatchingCycleDocument | null> {
  const snap = await adminDb.doc(`matchingCycles/${cycleId}`).get();
  return snap.exists ? (snap.data() as MatchingCycleDocument) : null;
}

export async function getCurrentCycle(): Promise<MatchingCycleDocument | null> {
  const cycles = await listCycles();
  return cycles[0] ?? null;
}

export interface MemberRunRow {
  id: string;
  data: MemberRunDocument;
}

export async function getCycleMemberRuns(cycleId: string): Promise<MemberRunRow[]> {
  const snap = await adminDb.collection(`matchingCycles/${cycleId}/memberRuns`).get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as MemberRunDocument }));
}

export interface SelectionCounts {
  zero: number;
  one: number;
  two: number;
  three: number;
}

/** Only counts memberRuns that actually finished (status "completed") — a still-claimed or failed run has no meaningful final count yet. */
export function computeSelectionCounts(runs: MemberRunRow[]): SelectionCounts {
  const counts: SelectionCounts = { zero: 0, one: 0, two: 0, three: 0 };
  for (const { data } of runs) {
    if (data.status !== "completed") continue;
    switch (data.proposalCount) {
      case 0:
        counts.zero += 1;
        break;
      case 1:
        counts.one += 1;
        break;
      case 2:
        counts.two += 1;
        break;
      default:
        counts.three += 1;
        break;
    }
  }
  return counts;
}
