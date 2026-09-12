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
  type ProfileDocument,
} from "./types";

function profileRef(uid: string) {
  return doc(db, "profiles", uid);
}

export async function getOrCreateProfile(
  uid: string,
): Promise<ProfileDocument> {
  const ref = profileRef(uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return snap.data() as ProfileDocument;
  }

  const initial: ProfileDocument = {
    visible: emptyAboutMeVisible,
    private: emptyAboutMePrivate,
    meta: {
      onboardingStepIndex: 0,
      aboutMeComplete: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  };

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
