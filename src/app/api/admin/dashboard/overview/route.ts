import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { listAllProfiles, loadSuspectedDuplicateUids } from "@/lib/admin/profiles";
import { isProfileInEligiblePool } from "@/lib/matching/eligibility";
import { adminDb } from "@/lib/firebase/admin";
import {
  computeSelectionCounts,
  getCurrentCycle,
  getCycleMemberRuns,
} from "@/lib/admin/matchingCycles";
import { computeCycleFunnelStats } from "@/lib/matching/analytics";
import { listBlockedPairs } from "@/lib/matching/pairHistory";
import { MEMBER_RUN_STALE_MINUTES } from "@/lib/matching/config";

export const runtime = "nodejs";

/**
 * The Overview home screen — every number here is clickable into a
 * filtered list on another screen (see the Admin Dashboard spec §4), so
 * this deliberately returns enough identifying info (filter keys, cycleId)
 * for the client to build those links, not just totals.
 */
export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const [rows, suspectedDuplicateUids, currentCycle, openDuplicatesSnap, blockedPairs] =
    await Promise.all([
      listAllProfiles(),
      loadSuspectedDuplicateUids(),
      getCurrentCycle(),
      adminDb.collection("duplicateCandidates").where("status", "==", "open").get(),
      listBlockedPairs(),
    ]);

  const members = {
    total: rows.length,
    activeSearch: rows.filter((r) => r.profile.meta.searchStatus === "active_search").length,
    passive: rows.filter((r) => r.profile.meta.searchStatus === "passive").length,
    eligible: rows.filter(
      (r) => r.profile.meta.profileStatus === "active_for_matching" && isProfileInEligiblePool(r.profile),
    ).length,
    incomplete: rows.filter((r) => r.profile.meta.profileStatus !== "active_for_matching").length,
    suspectedDuplicates: suspectedDuplicateUids.size,
  };

  let currentCycleSummary = null;
  let funnel = null;
  let zeroSelectionActiveMembers = 0;
  let failedRuns = 0;
  let staleRuns = 0;

  if (currentCycle) {
    const runs = await getCycleMemberRuns(currentCycle.id);
    const counts = computeSelectionCounts(runs);
    currentCycleSummary = {
      id: currentCycle.id,
      mode: currentCycle.mode,
      status: currentCycle.status,
      activeRecipients: currentCycle.stats.recipientsConsidered,
      processed: currentCycle.stats.recipientsCompleted,
      counts,
    };
    funnel = await computeCycleFunnelStats(currentCycle.id);

    zeroSelectionActiveMembers = counts.zero;
    failedRuns = runs.filter((r) => r.data.status === "failed").length;
    const staleThresholdMs = MEMBER_RUN_STALE_MINUTES * 60 * 1000;
    staleRuns = runs.filter((r) => {
      if (r.data.status !== "claimed") return false;
      const claimedAt = r.data.claimedAt as Timestamp | null;
      return !claimedAt || Date.now() - claimedAt.toDate().getTime() >= staleThresholdMs;
    }).length;
  }

  return NextResponse.json({
    ok: true,
    members,
    currentCycle: currentCycleSummary,
    funnel,
    attention: {
      zeroSelectionActiveMembers,
      failedRuns,
      staleRuns,
      openDuplicateCandidates: openDuplicatesSnap.size,
      blockedPairs: blockedPairs.length,
    },
  });
}
