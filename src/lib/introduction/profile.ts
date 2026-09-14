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
  emptyContactPreferences,
  emptyDealbreakers,
  emptyPreferences,
  emptyPresentation,
  normalizeChildrenAcceptance,
  type ProfileDocument,
} from "./types";
import { logDebugEvent } from "./onboardingDebug";

/**
 * Structural-only description of the RAW Firestore document (before
 * `withDefaults` fills any gaps) for the temporary debug overlay — see
 * onboardingDebug.ts. Deliberately reads the pre-merge shape, not the
 * normalized result, because the whole point is to see whether an
 * account's stored data is missing/mistyped fields a newer schema
 * version added; withDefaults would silently paper over exactly that.
 * No names, dates of birth, or contact info — only field presence/type.
 */
function rawShapeSummary(data: Partial<ProfileDocument> | undefined): string {
  if (!data) return "no document (will be created)";
  const birthDate = data.private?.birthDate as { toDate?: unknown } | null | undefined;
  return [
    `aboutMeComplete=${data.meta?.aboutMeComplete ?? "MISSING"}`,
    `stepIndex=${data.meta?.onboardingStepIndex ?? "MISSING"}`,
    `photos=${Array.isArray(data.photos) ? data.photos.length : `MISSING/wrong-type(${typeof data.photos})`}`,
    `finalized=${data.meta?.onboardingFinalized ?? "MISSING"}`,
    `personId=${data.meta?.personId ? "present" : "MISSING"}`,
    `searchStatus=${data.meta?.searchStatus ?? "MISSING"}`,
    `market=${data.visible?.market ?? "MISSING"}`,
    `marketAvailability=${data.visible?.marketAvailability ?? "MISSING"}`,
    `duplicateStatus=${data.meta?.duplicateStatus ?? "MISSING"}`,
    `birthDate=${birthDate ? (typeof birthDate.toDate === "function" ? "Timestamp" : `wrong-type(${typeof birthDate})`) : "null/missing"}`,
    `dealbreakers=${data.dealbreakers ? "present" : "MISSING"}`,
    `preferences=${data.preferences ? "present" : "MISSING"}`,
    `presentation=${data.presentation ? "present" : "MISSING"}`,
  ].join(" ");
}

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
function withDefaults(uid: string, data: Partial<ProfileDocument>): ProfileDocument {
  return {
    visible: { ...emptyAboutMeVisible, ...data.visible },
    private: { ...emptyAboutMePrivate, ...data.private },
    photos: data.photos ?? [],
    dealbreakers: {
      ...emptyDealbreakers,
      ...data.dealbreakers,
      // Same backward-compatible normalization as withProfileDefaults in
      // types.ts (the server-side/matching-engine read path) — see
      // normalizeChildrenAcceptance's doc comment. Needed here too since
      // this is the client's own read path, e.g. PreferencesSection.tsx
      // rendering a legacy profile's stored boolean as one of the three
      // new option chips.
      partnerHasChildrenOk: normalizeChildrenAcceptance(data.dealbreakers?.partnerHasChildrenOk),
      partnerHasYoungChildrenOk: normalizeChildrenAcceptance(data.dealbreakers?.partnerHasYoungChildrenOk),
    },
    preferences: { ...emptyPreferences, ...data.preferences },
    presentation: {
      ...emptyPresentation,
      ...data.presentation,
      prompts: { ...emptyPresentation.prompts, ...data.presentation?.prompts },
    },
    contactPreferences: { ...emptyContactPreferences, ...data.contactPreferences },
    meta: {
      onboardingStepIndex: 0,
      aboutMeComplete: false,
      photosComplete: false,
      preferencesComplete: false,
      presentationComplete: false,
      profileStatus: "draft",
      onboardingFinalized: false,
      // Defaults to this account's own uid — see ProfileDocument.meta.personId.
      personId: uid,
      searchStatus: "passive",
      duplicateStatus: "clear",
      duplicateOf: null,
      matchingAnchorAt: null,
      matchingSubscriptionId: null,
      matchingPeriodsProcessed: 0,
      nextMatchingDueAt: null,
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
    const raw = snap.data() as Partial<ProfileDocument>;
    logDebugEvent("RAW_PROFILE_SHAPE", rawShapeSummary(raw));
    return withDefaults(uid, raw);
  }
  logDebugEvent("RAW_PROFILE_SHAPE", rawShapeSummary(undefined));

  const initial: ProfileDocument = withDefaults(uid, {
    meta: {
      onboardingStepIndex: 0,
      aboutMeComplete: false,
      photosComplete: false,
      preferencesComplete: false,
      presentationComplete: false,
      profileStatus: "draft",
      onboardingFinalized: false,
      personId: uid,
      searchStatus: "passive",
      duplicateStatus: "clear",
      duplicateOf: null,
      matchingAnchorAt: null,
      matchingSubscriptionId: null,
      matchingPeriodsProcessed: 0,
      nextMatchingDueAt: null,
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
