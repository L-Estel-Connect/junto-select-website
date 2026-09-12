"use client";

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  emptyAboutMePrivate,
  emptyAboutMeVisible,
  emptyDealbreakers,
  emptyPreferences,
  emptyPresentation,
  type ProfileDocument,
} from "./types";

function profileRef(uid: string) {
  return doc(db, "profiles", uid);
}

/**
 * Fills in defaults for fields added after a profile document was first
 * created (photos/preferences/presentation shipped after Step 1), so an
 * account created before this stage doesn't crash reading its own data.
 * Firestore itself is never rewritten here — the next real save persists
 * whichever of these fields it touches, same as any other field.
 */
function withDefaults(data: Partial<ProfileDocument>): ProfileDocument {
  return {
    visible: { ...emptyAboutMeVisible, ...data.visible },
    private: { ...emptyAboutMePrivate, ...data.private },
    photos: data.photos ?? [],
    dealbreakers: { ...emptyDealbreakers, ...data.dealbreakers },
    preferences: { ...emptyPreferences, ...data.preferences },
    presentation: {
      ...emptyPresentation,
      ...data.presentation,
      prompts: { ...emptyPresentation.prompts, ...data.presentation?.prompts },
    },
    meta: {
      onboardingStepIndex: 0,
      aboutMeComplete: false,
      photosComplete: false,
      preferencesComplete: false,
      presentationComplete: false,
      profileStatus: "draft",
      onboardingFinalized: false,
      createdAt: null,
      updatedAt: null,
      ...data.meta,
    },
  };
}

export async function getOrCreateProfile(
  uid: string,
): Promise<ProfileDocument> {
  const ref = profileRef(uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return withDefaults(snap.data() as Partial<ProfileDocument>);
  }

  const initial: ProfileDocument = withDefaults({
    meta: {
      onboardingStepIndex: 0,
      aboutMeComplete: false,
      photosComplete: false,
      preferencesComplete: false,
      presentationComplete: false,
      profileStatus: "draft",
      onboardingFinalized: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  });

  await setDoc(ref, initial);
  return initial;
}

export async function saveStepAnswer(
  uid: string,
  fields: Record<string, unknown>,
  nextStepIndex: number,
) {
  await updateDoc(profileRef(uid), {
    ...fields,
    "meta.onboardingStepIndex": nextStepIndex,
    "meta.updatedAt": serverTimestamp(),
  });
}

export async function markAboutMeComplete(uid: string) {
  await updateDoc(profileRef(uid), {
    "meta.aboutMeComplete": true,
    "meta.updatedAt": serverTimestamp(),
  });
}

/**
 * The one and only place `meta.onboardingFinalized` is ever set to true —
 * called exclusively from the Review screen's "Guardar y finalizar"
 * action. Never inferred automatically from section completeness.
 */
export async function finalizeOnboarding(uid: string): Promise<void> {
  await updateDoc(profileRef(uid), {
    "meta.onboardingFinalized": true,
    "meta.updatedAt": serverTimestamp(),
  });
}

/**
 * Writes a set of dotted-path fields to the profile (e.g.
 * `"dealbreakers.gendersSought"`) plus whichever `meta` flags are given,
 * and always bumps `updatedAt`. Shared by photos/preferences/presentation
 * so each of those stays a thin, purpose-named wrapper around one write.
 */
export async function updateProfileFields(
  uid: string,
  fields: Record<string, unknown>,
  metaFields: Record<string, unknown> = {},
) {
  const prefixedMeta = Object.fromEntries(
    Object.entries(metaFields).map(([key, value]) => [`meta.${key}`, value]),
  );
  await updateDoc(profileRef(uid), {
    ...fields,
    ...prefixedMeta,
    "meta.updatedAt": serverTimestamp(),
  });
}
