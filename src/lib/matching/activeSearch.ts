import type { ProfileDocument } from "@/lib/introduction/types";
import { computeProfileStatus } from "@/lib/introduction/completion";
import { isProfileInEligiblePool } from "./eligibility";

/**
 * Why a member does (or doesn't) receive their OWN monthly proposals.
 * Payment alone is not enough: the Introductions profile must also be
 * finalized (which now records explicit consent) and be in the eligible
 * pool. Checked server-side by the due scheduler before a period runs and
 * by the engine when selecting recipients, so the two can never disagree.
 *
 * The stored `meta.profileStatus` can be written by the client SDK (see
 * firestore.rules), so it is re-derived here from the profile's actual
 * content and both must agree; a hand-edited status can't make someone a
 * recipient.
 */
export type ActiveSearchBlocker = "not_paying" | "not_finalized" | "not_in_pool" | "profile_incomplete";

export function activeSearchBlocker(profile: ProfileDocument): ActiveSearchBlocker | null {
  if (profile.meta.searchStatus !== "active_search") return "not_paying";
  if (!profile.meta.onboardingFinalized) return "not_finalized";
  if (!isProfileInEligiblePool(profile)) return "not_in_pool";
  if (computeProfileStatus(profile) !== "active_for_matching") return "profile_incomplete";
  return null;
}

export function isEligibleForActiveSearch(profile: ProfileDocument): boolean {
  return activeSearchBlocker(profile) === null;
}
