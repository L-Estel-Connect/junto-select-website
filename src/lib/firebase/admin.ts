import "server-only";
import { getApps, getApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * No explicit credentials: on Firebase App Hosting, the Admin SDK
 * resolves them automatically from the backend's attached service
 * account (Application Default Credentials). For local development
 * against the Firebase Emulator Suite, set FIREBASE_AUTH_EMULATOR_HOST
 * and FIRESTORE_EMULATOR_HOST (see README) — the Admin SDK picks those up
 * the same way. This only runs inside server-only route handlers, never
 * during static prerendering, so a sandbox with no credentials at all
 * (e.g. this repo's own build step) never actually calls anything here.
 */
const app = getApps().length ? getApp() : initializeApp();

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
