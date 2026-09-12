import type { Dealbreakers, ProfileDocument, ProfileStatus } from "./types";

export function isPhotosComplete(photos: string[]): boolean {
  return photos.length >= 1;
}

/**
 * The dealbreakers section (the matching engine's hard filters) must be
 * fully answered before a profile counts as "Lo que buscas: completado" —
 * the soft `preferences` fields stay optional by design, since they're
 * scoring signals, not requirements.
 */
export function isPreferencesComplete(dealbreakers: Dealbreakers): boolean {
  return (
    dealbreakers.gendersSought.length > 0 &&
    dealbreakers.ageMin !== null &&
    dealbreakers.ageMax !== null &&
    dealbreakers.maxDistance !== null &&
    dealbreakers.relationshipIntentionsAccepted.length > 0 &&
    dealbreakers.smokingAccepted.length > 0 &&
    dealbreakers.partnerHasChildrenOk !== null &&
    dealbreakers.partnerHasYoungChildrenOk !== null &&
    dealbreakers.partnerWantsFutureChildren !== null
  );
}

export function isPresentationComplete(
  status: ProfileDocument["presentation"]["status"],
): boolean {
  return status === "approved";
}

/**
 * Sections required before a profile is eligible for matching. Deliberately
 * excludes "presentation" for now — see project notes: a curated intro
 * without a written presentation is still meaningfully useful, and making
 * it mandatory risked stalling otherwise-ready profiles. Flipping this is
 * a one-line change (add "presentation" below); nothing else references
 * this list.
 */
const SECTIONS_REQUIRED_FOR_MATCHING = [
  "aboutMe",
  "photos",
  "preferences",
] as const;

export function computeProfileStatus(profile: {
  meta: Pick<ProfileDocument["meta"], "aboutMeComplete">;
  photos: string[];
  dealbreakers: Dealbreakers;
  presentation: Pick<ProfileDocument["presentation"], "status">;
}): ProfileStatus {
  const sectionComplete: Record<
    "aboutMe" | "photos" | "preferences" | "presentation",
    boolean
  > = {
    aboutMe: profile.meta.aboutMeComplete,
    photos: isPhotosComplete(profile.photos),
    preferences: isPreferencesComplete(profile.dealbreakers),
    presentation: isPresentationComplete(profile.presentation.status),
  };

  const eligible = SECTIONS_REQUIRED_FOR_MATCHING.every(
    (section) => sectionComplete[section],
  );

  return eligible ? "active_for_matching" : "draft";
}

// --- Linear first-time onboarding flow -----------------------------------
//
// Note this is a separate concept from SECTIONS_REQUIRED_FOR_MATCHING
// above: reaching the Review screen (and finalizing) via the natural
// forward flow requires an approved presentation, even though the
// matching-eligibility computation above deliberately does not. Both are
// intentional; they answer different questions ("can this profile be
// matched" vs "has this person walked the guided setup to completion").

export const ONBOARDING_STAGE_ORDER = [
  "/introduction/onboarding",
  "/introduction/preferences",
  "/introduction/photos",
  "/introduction/presentation",
  "/introduction/review",
  "/introduction/home",
] as const;

export type OnboardingRoute = (typeof ONBOARDING_STAGE_ORDER)[number];

type OnboardingFlowProfile = {
  meta: Pick<ProfileDocument["meta"], "aboutMeComplete" | "onboardingFinalized">;
  dealbreakers: Dealbreakers;
  photos: string[];
  presentation: Pick<ProfileDocument["presentation"], "status">;
};

/**
 * The single source of truth for "what's the next step in the guided
 * onboarding flow" — used both to send a returning user to the right
 * place and to gate each page's own prerequisites.
 */
export function getNextOnboardingRoute(
  profile: OnboardingFlowProfile,
): OnboardingRoute {
  if (!profile.meta.aboutMeComplete) return "/introduction/onboarding";
  if (!isPreferencesComplete(profile.dealbreakers)) return "/introduction/preferences";
  if (!isPhotosComplete(profile.photos)) return "/introduction/photos";
  if (!isPresentationComplete(profile.presentation.status)) return "/introduction/presentation";
  if (!profile.meta.onboardingFinalized) return "/introduction/review";
  return "/introduction/home";
}

/**
 * Returns where to redirect if `currentRoute`'s prerequisites aren't met
 * yet, or null if it's fine to render `currentRoute` as-is. Only ever
 * redirects forward-to-earlier when something's missing — never away from
 * a page whose prerequisites ARE satisfied, even if later stages are also
 * already done. That's what lets Profile Home's hub reopen an
 * already-completed section (Fotos, Lo que buscas, ...) for editing
 * without being bounced back into the linear flow.
 */
export function getPrerequisiteRedirect(
  profile: OnboardingFlowProfile,
  currentRoute: OnboardingRoute,
): OnboardingRoute | null {
  const nextRoute = getNextOnboardingRoute(profile);
  const nextIndex = ONBOARDING_STAGE_ORDER.indexOf(nextRoute);
  const currentIndex = ONBOARDING_STAGE_ORDER.indexOf(currentRoute);
  return nextIndex < currentIndex ? nextRoute : null;
}
