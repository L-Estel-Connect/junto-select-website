import "server-only";
import { getApps, getApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

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

/**
 * A function, not an eagerly-evaluated constant: `next build` imports
 * every route module to collect its config (e.g. `export const runtime`),
 * which would otherwise call `.bucket()` at build/module-load time — long
 * before any real request, and in this sandbox before
 * NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is even set, which throws
 * immediately. Deferring the call to first actual use avoids that.
 *
 * Explicit bucket name: this project's bucket uses the newer
 * `<project-id>.firebasestorage.app` naming (see
 * NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET in apphosting.yaml), which the Admin
 * SDK does not always infer correctly from ADC alone. Reusing that same
 * public env var here keeps the two in sync by construction — there's only
 * one place either could drift from the real bucket name.
 */
export function getAdminStorageBucket() {
  return getStorage(app).bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined);
}
