"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from "firebase/storage";

// Fall back to inert placeholder values when env vars aren't set. This is
// what lets `next build`'s static prerendering pass (it evaluates this
// client module in Node to produce the initial HTML shell) in
// environments — including this repo's own CI/build step — that don't
// have real Firebase config yet. Firebase itself isn't actually used
// until a browser hydrates the page, by which point the real
// NEXT_PUBLIC_* values (once configured for the deployment) are what's
// baked into the served bundle.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-project",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "demo-project.appspot.com",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "0",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:0:web:0",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

// All Junto Select Introduction user-facing content is Spanish for V1 —
// this makes Firebase Auth request the Spanish version of its own emails
// (sign-in link, etc.) instead of whatever the project default is.
auth.languageCode = "es";

// Connect to local emulators when explicitly requested. Guarded so this
// never runs against the real project by accident, and only runs once
// even with React's dev-mode double render.
declare global {
  var __junto_emulators_connected__: boolean | undefined;
}

if (
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" &&
  typeof window !== "undefined" &&
  !globalThis.__junto_emulators_connected__
) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  globalThis.__junto_emulators_connected__ = true;
}
