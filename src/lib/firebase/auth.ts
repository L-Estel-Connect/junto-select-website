"use client";

import {
  GoogleAuthProvider,
  OAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./client";

const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

export function signInWithGoogle() {
  return signInWithRedirect(auth, googleProvider);
}

export function signInWithApple() {
  return signInWithRedirect(auth, appleProvider);
}

export function signOutUser() {
  return signOut(auth);
}

/**
 * Ensures a `users/{uid}` document exists the first time someone signs in.
 * Firebase Auth itself is what prevents duplicate accounts for the same
 * person across Google/Apple (same uid returned once account linking is
 * configured — see README) — this just mirrors that single identity into
 * Firestore for the rest of the app to read.
 */
async function ensureUserDocument(user: User) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(ref, {
    email: user.email,
    displayName: user.displayName ?? null,
    createdAt: serverTimestamp(),
    role: "member",
  });
}

/**
 * Call once on app load to finish a signInWithRedirect flow, if one is in
 * progress. Safe to call even when there's no pending redirect.
 */
export async function completeRedirectSignIn() {
  const result = await getRedirectResult(auth);
  if (result?.user) {
    await ensureUserDocument(result.user);
  }
  return result;
}

export function watchAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
