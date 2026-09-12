"use client";

import { computeProfileStatus, isPreferencesComplete } from "./completion";
import { updateProfileFields } from "./profile";
import type { Dealbreakers, Preferences, ProfileDocument } from "./types";

export async function saveDealbreakers(
  uid: string,
  dealbreakers: Dealbreakers,
  profile: ProfileDocument,
): Promise<void> {
  const profileStatus = computeProfileStatus({ ...profile, dealbreakers });
  await updateProfileFields(
    uid,
    { dealbreakers },
    { preferencesComplete: isPreferencesComplete(dealbreakers), profileStatus },
  );
}

export async function savePreferences(
  uid: string,
  preferences: Preferences,
): Promise<void> {
  await updateProfileFields(uid, { preferences });
}
