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
 * Every "About me" field name `isAboutMeComplete` can report missing —
 * shared with `aboutMeMissingFields` below so the boolean and the
 * diagnostic list can never drift apart into two different definitions of
 * "complete."
 */
export type AboutMeFieldName =
  | "firstName"
  | "gender"
  | "birthDate"
  | "city"
  | "profession"
  | "educationLevel"
  | "incomeRange"
  | "languages"
  | "hasChildren"
  | "childrenCount"
  | "childrenBirthYears"
  | "wantsFutureChildren"
  | "relationshipIntention"
  | "smoking"
  | "drinking"
  | "activityLevel"
  | "marketAvailability";

/**
 * The exact list of "About me" fields still missing/unanswered — the
 * single source of truth `isAboutMeComplete` (just `.length === 0` of
 * this) and admin diagnostics (`diagnoseProfileStatus` below) both read,
 * so there is never a second, independently-maintained definition of
 * "complete" that could quietly drift from this one. Never the historical
 * `meta.aboutMeComplete` flag: that flag is set once, the first time
 * someone finishes the onboarding wizard, and is never revisited — if new
 * required fields are added later (as happened with
 * childrenBirthYears/wantsFutureChildren/marketAvailability), a profile
 * that finished onboarding *before* they existed would otherwise keep
 * counting as complete forever, with the matching engine only ever seeing
 * `null` for data it needs.
 *
 * `heightCm` is intentionally not checked — optional by design (skippable
 * in onboarding). `market` is not checked — it's a V1 constant, not
 * something anyone answers (see AboutMeVisible.market).
 */
export function aboutMeMissingFields(profile: AboutMeCompletionInput): AboutMeFieldName[] {
  const { visible, private: priv } = profile;
  const missing: AboutMeFieldName[] = [];

  if (!visible.firstName.trim()) missing.push("firstName");
  if (visible.gender === null) missing.push("gender");
  if (priv.birthDate === null) missing.push("birthDate");
  if (!visible.city.trim()) missing.push("city");
  if (!visible.profession.trim()) missing.push("profession");
  if (visible.educationLevel === null) missing.push("educationLevel");
  if (priv.incomeRange === null) missing.push("incomeRange");
  if (visible.languages.length === 0) missing.push("languages");

  if (visible.hasChildren === null) {
    missing.push("hasChildren");
  } else if (visible.hasChildren === true) {
    if (visible.childrenCount === null) missing.push("childrenCount");
    if (
      !visible.childrenBirthYears ||
      visible.childrenBirthYears.length !== visible.childrenCount
    ) {
      missing.push("childrenBirthYears");
    }
  }
  if (visible.wantsFutureChildren === null) missing.push("wantsFutureChildren");

  if (visible.relationshipIntention === null) missing.push("relationshipIntention");
  if (visible.smoking === null) missing.push("smoking");
  if (visible.drinking === null) missing.push("drinking");
  if (visible.activityLevel === null) missing.push("activityLevel");
  if (visible.marketAvailability === null) missing.push("marketAvailability");

  return missing;
}

/**
 * Whether "About me" is genuinely complete, checked against the actual
 * field values — see `aboutMeMissingFields` (the single source of truth
 * this is derived from) for the full rationale. This is what
 * `computeProfileStatus` and the onboarding-flow routing below both use.
 */
export function isAboutMeComplete(profile: AboutMeCompletionInput): boolean {
  return aboutMeMissingFields(profile).length === 0;
}

/**
 * Every dealbreaker field name `isPreferencesComplete` can report missing
 * — same shared-source-of-truth contract as `AboutMeFieldName` above.
 * `ageRange` is reported separately from `ageMin`/`ageMax` themselves: an
 * impossible range (min > max, both actually answered) is a different,
 * more specific problem than either bound being unanswered.
 */
export type PreferencesFieldName =
  | "gendersSought"
  | "ageMin"
  | "ageMax"
  | "ageRange"
  | "maxDistance"
  | "relationshipIntentionsAccepted"
  | "smokingAccepted"
  | "partnerYoungChildrenMatters"
  | "partnerWantsFutureChildren";

/**
 * The exact list of "Lo que buscas" (dealbreaker) fields still
 * missing/invalid — see `aboutMeMissingFields`'s doc comment for why this
 * shared-source-of-truth shape exists at all.
 */
export function preferencesMissingFields(dealbreakers: Dealbreakers): PreferencesFieldName[] {
  const missing: PreferencesFieldName[] = [];
  if (dealbreakers.gendersSought.length === 0) missing.push("gendersSought");
  if (dealbreakers.ageMin === null) missing.push("ageMin");
  if (dealbreakers.ageMax === null) missing.push("ageMax");
  if (
    dealbreakers.ageMin !== null &&
    dealbreakers.ageMax !== null &&
    dealbreakers.ageMin > dealbreakers.ageMax
  ) {
    // Defense in depth behind the UI's own validation
    // (PreferencesSection.tsx) — an impossible range must never count as
    // complete, since it would silently reject every candidate via
    // acceptsAge rather than ever surfacing as the input error it
    // actually is.
    missing.push("ageRange");
  }
  if (dealbreakers.maxDistance === null) missing.push("maxDistance");
  if (dealbreakers.relationshipIntentionsAccepted.length === 0) missing.push("relationshipIntentionsAccepted");
  if (dealbreakers.smokingAccepted.length === 0) missing.push("smokingAccepted");
  if (dealbreakers.partnerYoungChildrenMatters === null) missing.push("partnerYoungChildrenMatters");
  if (dealbreakers.partnerWantsFutureChildren === null) missing.push("partnerWantsFutureChildren");
  return missing;
}

/**
 * The dealbreakers section (the matching engine's hard filters) must be
 * fully answered before a profile counts as "Lo que buscas: completado" —
 * the soft `preferences` fields stay optional by design, since they're
 * scoring signals, not requirements. See `preferencesMissingFields` (the
 * single source of truth this is derived from).
 */
export function isPreferencesComplete(dealbreakers: Dealbreakers): boolean {
  return preferencesMissingFields(dealbreakers).length === 0;
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

export interface ProfileStatusDiagnosis {
  /** Whatever is currently persisted at `meta.profileStatus` — what `loadEligiblePool`'s Firestore query actually filters on. */
  storedStatus: ProfileStatus;
  /** What `computeProfileStatus` would say RIGHT NOW, from the profile's actual current field values. */
  computedStatus: ProfileStatus;
  /**
   * True when `storedStatus` no longer matches `computedStatus` — the
   * profile was `active_for_matching`/`draft` the last time something
   * actually wrote `meta.profileStatus` (onboarding finishing, or a
   * preferences/photos/presentation/"Sobre ti" save), but a schema change
   * since then (a newly required field, a redefined completeness rule)
   * means the stored flag no longer reflects reality. `loadEligiblePool`
   * trusts the STORED flag only (Firestore can't query a computed
   * expression), so a stale `active_for_matching` silently over-includes
   * someone who is actually incomplete, and a stale `draft` silently
   * excludes someone who has since become complete via a path that
   * doesn't happen to recompute status.
   */
  stale: boolean;
  sections: {
    aboutMe: { complete: boolean; missingFields: AboutMeFieldName[] };
    photos: { complete: boolean };
    preferences: { complete: boolean; missingFields: PreferencesFieldName[] };
    presentation: { complete: boolean };
  };
}

/**
 * Admin-only diagnostic: the exact reason a profile is (or isn't) eligible
 * for matching right now, field by field — never used to gate anything
 * itself (that's still the STORED `meta.profileStatus`, read via
 * `loadEligiblePool`/`isProfileInEligiblePool`), only to explain it. See
 * `ProfileStatusDiagnosis.stale`'s doc comment for why the stored flag and
 * this live recomputation can legitimately disagree.
 */
export function diagnoseProfileStatus(
  profile: AboutMeCompletionInput & {
    photos: string[];
    dealbreakers: Dealbreakers;
    presentation: Pick<ProfileDocument["presentation"], "status">;
    meta: Pick<ProfileDocument["meta"], "profileStatus">;
  },
): ProfileStatusDiagnosis {
  const computedStatus = computeProfileStatus(profile);
  return {
    storedStatus: profile.meta.profileStatus,
    computedStatus,
    stale: profile.meta.profileStatus !== computedStatus,
    sections: {
      aboutMe: { complete: isAboutMeComplete(profile), missingFields: aboutMeMissingFields(profile) },
      photos: { complete: isPhotosComplete(profile.photos) },
      preferences: {
        complete: isPreferencesComplete(profile.dealbreakers),
        missingFields: preferencesMissingFields(profile.dealbreakers),
      },
      presentation: { complete: isPresentationComplete(profile.presentation.status) },
    },
  };
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
