import type {
  AboutMePrivate,
  AboutMeVisible,
  Dealbreakers,
  ProfileDocument,
  ProfileStatus,
} from "./types";

export function isPhotosComplete(photos: string[]): boolean {
  return photos.length >= 1;
}

type AboutMeCompletionInput = {
  visible: Pick<
    AboutMeVisible,
    | "firstName"
    | "gender"
    | "city"
    | "profession"
    | "educationLevel"
    | "languages"
    | "hasChildren"
    | "childrenCount"
    | "childrenBirthYears"
    | "wantsFutureChildren"
    | "relationshipIntention"
    | "smoking"
    | "drinking"
    | "activityLevel"
    | "marketAvailability"
  >;
  private: Pick<AboutMePrivate, "birthDate" | "incomeRange">;
};

/**
 * Whether "About me" is genuinely complete, checked against the actual
 * field values — never the historical `meta.aboutMeComplete` flag. That
 * flag is set once, the first time someone finishes the onboarding
 * wizard, and is never revisited; if new required fields are added later
 * (as happened with childrenBirthYears/wantsFutureChildren/
 * marketAvailability), a profile that finished onboarding *before* they
 * existed would otherwise keep counting as complete forever, with the
 * matching engine only ever seeing `null` for data it needs. This is the
 * single source of truth `computeProfileStatus` and the onboarding-flow
 * routing below both use instead.
 *
 * `heightCm` is intentionally not checked — optional by design (skippable
 * in onboarding). `market` is not checked — it's a V1 constant, not
 * something anyone answers (see AboutMeVisible.market).
 */
export function isAboutMeComplete(profile: AboutMeCompletionInput): boolean {
  const { visible, private: priv } = profile;

  if (!visible.firstName.trim()) return false;
  if (visible.gender === null) return false;
  if (priv.birthDate === null) return false;
  if (!visible.city.trim()) return false;
  if (!visible.profession.trim()) return false;
  if (visible.educationLevel === null) return false;
  if (priv.incomeRange === null) return false;
  if (visible.languages.length === 0) return false;

  if (visible.hasChildren === null) return false;
  if (visible.hasChildren === true) {
    if (visible.childrenCount === null) return false;
    if (
      !visible.childrenBirthYears ||
      visible.childrenBirthYears.length !== visible.childrenCount
    ) {
      return false;
    }
  }
  if (visible.wantsFutureChildren === null) return false;

  if (visible.relationshipIntention === null) return false;
  if (visible.smoking === null) return false;
  if (visible.drinking === null) return false;
  if (visible.activityLevel === null) return false;
  if (visible.marketAvailability === null) return false;

  return true;
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
    // Defense in depth behind the UI's own validation (PreferencesSection.tsx)
    // — an impossible range (min > max) must never count as complete, since
    // it would silently reject every candidate via acceptsAge rather than
    // ever surfacing as the input error it actually is.
    dealbreakers.ageMin <= dealbreakers.ageMax &&
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

export function computeProfileStatus(
  profile: AboutMeCompletionInput & {
    photos: string[];
    dealbreakers: Dealbreakers;
    presentation: Pick<ProfileDocument["presentation"], "status">;
  },
): ProfileStatus {
  const sectionComplete: Record<
    "aboutMe" | "photos" | "preferences" | "presentation",
    boolean
  > = {
    aboutMe: isAboutMeComplete(profile),
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
  "/member/profile/preferences",
  "/member/profile/photos",
  "/member/profile/presentation",
  "/member/profile",
  "/member",
] as const;

export type OnboardingRoute = (typeof ONBOARDING_STAGE_ORDER)[number];

type OnboardingFlowProfile = AboutMeCompletionInput & {
  meta: Pick<ProfileDocument["meta"], "onboardingFinalized">;
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
  if (!isAboutMeComplete(profile)) return "/introduction/onboarding";
  if (!isPreferencesComplete(profile.dealbreakers)) return "/member/profile/preferences";
  if (!isPhotosComplete(profile.photos)) return "/member/profile/photos";
  if (!isPresentationComplete(profile.presentation.status)) return "/member/profile/presentation";
  if (!profile.meta.onboardingFinalized) return "/member/profile";
  return "/member";
}

/**
 * Guard for every /member/** page other than /member/profile itself
 * (which has its own finer-grained prerequisite check): send anyone not
 * yet finalized back into the flow, wherever they actually need to be.
 */
export function requireFinalized(profile: OnboardingFlowProfile): OnboardingRoute | null {
  return profile.meta.onboardingFinalized ? null : getNextOnboardingRoute(profile);
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
