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
