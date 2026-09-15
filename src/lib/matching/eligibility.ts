import type { ProfileDocument } from "@/lib/introduction/types";
import { diagnoseProfileStatus, isMarketAvailabilityEligible } from "@/lib/introduction/completion";

/**
 * The per-profile membership test for the matching pool — factored out so
 * `engine.ts`'s `loadEligiblePool` (the normal monthly cycle) and
 * `manualSuggestion.ts` (the admin founder-suggestion exception) apply the
 * exact same eligibility rule rather than two rules that could quietly
 * drift apart. Does NOT check `searchStatus` — a passive profile can still
 * be a CANDIDATE (this is what this function decides); whether someone
 * receives their OWN proposals is a separate question (see
 * `selectRecipients` in engine.ts).
 *
 * Madrid availability (`isMarketAvailabilityEligible`) is an INDIVIDUAL
 * service-eligibility condition, checked once per profile here — it is
 * never a pair-compatibility criterion (see hardFilters.ts/scoring.ts,
 * neither of which reference marketAvailability at all): once both
 * people individually pass this gate, their exact Madrid relationship
 * (resident / near / frequent visitor — all equivalent) is irrelevant to
 * whether or how well they match.
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
  if (!isMarketAvailabilityEligible(profile)) return false;
  return true;
}

export type EligibilityFailureReason =
  | "profile_status_not_active"
  | "gender_preference_ambiguous"
  | "duplicate_suspected"
  | "duplicate_confirmed"
  | "market_not_madrid"
  | "market_not_available";

export interface EligibilityDiagnosis {
  eligible: boolean;
  reasons: EligibilityFailureReason[];
  /**
   * Only meaningful when `profile_status_not_active` is among `reasons` —
   * the exact section/field breakdown behind the stored `meta.profileStatus`
   * not being `active_for_matching` right now, including whether that
   * stored value is itself STALE relative to the profile's actual current
   * data (see `ProfileStatusDiagnosis.stale`). Admin-only detail — see
   * manualSuggestion.ts / memberDetail.ts for where this is surfaced.
   */
  profileStatus: ReturnType<typeof diagnoseProfileStatus>;
}

/**
 * Admin-only: every reason `isProfileInEligiblePool` would exclude this
 * profile right now, in the same fixed order that function checks them,
 * plus the full field-level breakdown behind an incomplete profileStatus.
 * `isProfileInEligiblePool` itself stays reason-less on purpose (it's the
 * hot path the matching engine calls per-candidate); this is the slower,
 * explanatory sibling used only where a human needs to understand a
 * result, not just act on it — see Admin Dashboard "why is this member not
 * eligible" surfaces.
 */
export function explainIneligibility(profile: ProfileDocument): EligibilityDiagnosis {
  const reasons: EligibilityFailureReason[] = [];
  if (profile.meta.profileStatus !== "active_for_matching") reasons.push("profile_status_not_active");
  // Called out as its own top-level reason (in addition to also showing
  // up inside profileStatus.sections.preferences.missingFields) because
  // it needs a specific, actionable admin message — see labels.ts — not
  // to be lost inside a generic "incomplete" bucket.
  if (profile.dealbreakers.gendersSought.length > 1) reasons.push("gender_preference_ambiguous");
  if (profile.meta.duplicateStatus === "suspected") reasons.push("duplicate_suspected");
  if (profile.meta.duplicateStatus === "confirmed_duplicate") reasons.push("duplicate_confirmed");
  if (profile.visible.market !== "madrid") reasons.push("market_not_madrid");
  if (!isMarketAvailabilityEligible(profile)) reasons.push("market_not_available");
  return { eligible: reasons.length === 0, reasons, profileStatus: diagnoseProfileStatus(profile) };
}
