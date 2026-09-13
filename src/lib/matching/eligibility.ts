import type { ProfileDocument } from "@/lib/introduction/types";

/**
 * The per-profile membership test for the matching pool — factored out so
 * `engine.ts`'s `loadEligiblePool` (the normal monthly cycle) and
 * `manualSuggestion.ts` (the admin founder-suggestion exception) apply the
 * exact same eligibility rule rather than two rules that could quietly
 * drift apart. Does NOT check `searchStatus` — a passive profile can still
 * be a CANDIDATE (this is what this function decides); whether someone
 * receives their OWN proposals is a separate question (see
 * `selectRecipients` in engine.ts).
 */
export function isProfileInEligiblePool(profile: ProfileDocument): boolean {
  if (profile.meta.profileStatus !== "active_for_matching") return false;
  if (
    profile.meta.duplicateStatus === "suspected" ||
    profile.meta.duplicateStatus === "confirmed_duplicate"
  ) {
    return false;
  }
  // V1 product scope: Madrid only — unknown availability is excluded, same
  // as any other unknown self-report data (never assumed compatible).
  if (profile.visible.market !== "madrid") return false;
  if (
    profile.visible.marketAvailability == null ||
    profile.visible.marketAvailability === "not_regular_in_market"
  ) {
    return false;
  }
  return true;
}
