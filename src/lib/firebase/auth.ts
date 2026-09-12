"use client";

import {
  GoogleAuthProvider,
  getRedirectResult,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./client";

const googleProvider = new GoogleAuthProvider();

const EMAIL_STORAGE_KEY = "junto_email_for_signin";

export function signInWithGoogle() {
  return signInWithRedirect(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}

/**
 * Ensures a `users/{uid}` document exists the first time someone signs in.
 * Firebase Auth itself is what prevents duplicate accounts for the same
 * person across Google and email link (same uid returned once "Link
 * accounts that use the same email" is enabled — see README) — this just
 * mirrors that single identity into Firestore for the rest of the app to
 * read.
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

// --- Email magic link ---------------------------------------------------

/**
 * Sends a passwordless sign-in link to `email`. The link always points
 * back at /introduction on whatever origin is currently running (so this
 * works unchanged in the emulator, on localhost, and in production —
 * each just needs to be in Firebase's authorized domains list).
 */
export async function sendMagicLink(email: string) {
  await sendSignInLinkToEmail(auth, email, {
    url: `${window.location.origin}/introduction`,
    handleCodeInApp: true,
  });
  window.localStorage.setItem(EMAIL_STORAGE_KEY, email);
}

export function isMagicLinkUrl(url: string) {
  return isSignInWithEmailLink(auth, url);
}

export function getStoredEmailForSignIn(): string | null {
  return window.localStorage.getItem(EMAIL_STORAGE_KEY);
}

/**
 * Completes sign-in from a clicked magic link. `email` must be provided —
 * normally recovered automatically from localStorage (same browser the
 * link was requested from); if that's empty (e.g. the link was opened on
 * a different device), the caller must ask the person to confirm it.
 */
export async function completeMagicLinkSignIn(email: string, url: string) {
  const result = await signInWithEmailLink(auth, email, url);
  window.localStorage.removeItem(EMAIL_STORAGE_KEY);
  await ensureUserDocument(result.user);
  return result;
}
