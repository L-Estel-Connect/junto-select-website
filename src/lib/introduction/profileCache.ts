"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getOrCreateProfile } from "./profile";
import { watchAuthState } from "@/lib/firebase/auth";
import type { ProfileDocument } from "./types";

/**
 * One shared, in-memory profile cache per uid, used by every onboarding/
 * member page instead of each independently calling `getOrCreateProfile`.
 *
 * Fixes the "9 independent full-profile getDoc reads" finding from the
 * perf diagnostic: the first page a session touches pays one Firestore
 * read; every other page (and every redirect hop through
 * getNextOnboardingRoute) in the same session reuses the same in-memory
 * copy instead of re-fetching an unchanged document.
 *
 * Deliberately a plain module-level Map + `useSyncExternalStore`, not a
 * dependency (no SWR/React Query) and not a Context tree spanning
 * /introduction and /member (which don't share a layout today, so a
 * Provider couldn't cover both without a larger restructure) — this is
 * the smallest thing that gives every consumer, anywhere, the same live
 * data for a given uid.
 */

interface CacheEntry {
  profile: ProfileDocument | null;
  error: string | null;
  promise: Promise<void> | null;
  version: number;
  listeners: Set<() => void>;
}

const cache = new Map<string, CacheEntry>();

function getEntry(uid: string): CacheEntry {
  let entry = cache.get(uid);
  if (!entry) {
    entry = { profile: null, error: null, promise: null, version: 0, listeners: new Set() };
    cache.set(uid, entry);
  }
  return entry;
}

function bump(entry: CacheEntry) {
  entry.version += 1;
  entry.listeners.forEach((listener) => listener());
}

function load(uid: string, force: boolean): Promise<void> {
  const entry = getEntry(uid);
  if (entry.promise && !force) return entry.promise;

  entry.promise = getOrCreateProfile(uid)
    .then((doc) => {
      entry.profile = doc;
      entry.error = null;
    })
    .catch((err) => {
      // Every outcome reaches a terminal state (mirrors the photo-cache
      // fix) — a rejected read is remembered as an error rather than
      // leaving `profile` unset with no signal, which previously could
      // leave a page on its loading screen forever with no way out.
      entry.error = err instanceof Error ? err.message : "No hemos podido cargar tu perfil.";
    })
    .finally(() => {
      entry.promise = null;
      bump(entry);
    });
  return entry.promise;
}

/**
 * Discards every cached profile — called automatically whenever Firebase
 * Auth reports no signed-in user (explicit sign-out, or session loss), so
 * no private profile data lingers in memory for whoever uses this
 * tab/browser next.
 */
export function clearProfileCache(): void {
  cache.clear();
}

let watcherStarted = false;
function ensureAuthWatcher() {
  if (watcherStarted || typeof window === "undefined") return;
  watcherStarted = true;
  watchAuthState((user) => {
    if (!user) clearProfileCache();
  });
}

export interface SharedProfile {
  profile: ProfileDocument | null;
  loading: boolean;
  error: string | null;
  /** Re-fetches from Firestore even if a cached copy already exists. */
  refresh: () => Promise<void>;
  /**
   * Applies a local, synchronous update to the cached profile and
   * notifies every other mounted component reading this same uid — the
   * replacement for the old per-component `setProfile(prev => ...)`
   * pattern after a successful save. Never writes to Firestore itself;
   * callers still perform their own save first, exactly as before.
   */
  mutate: (updater: (prev: ProfileDocument) => ProfileDocument) => void;
}

export function useSharedProfile(uid: string): SharedProfile {
  ensureAuthWatcher();

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const entry = getEntry(uid);
      entry.listeners.add(onStoreChange);
      if (!entry.profile && !entry.error && !entry.promise) {
        void load(uid, false);
      }
      return () => {
        entry.listeners.delete(onStoreChange);
      };
    },
    [uid],
  );
  const getSnapshot = useCallback(() => getEntry(uid).version, [uid]);

  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const entry = getEntry(uid);
  const refresh = useCallback(() => load(uid, true), [uid]);
  const mutate = useCallback(
    (updater: (prev: ProfileDocument) => ProfileDocument) => {
      const e = getEntry(uid);
      if (!e.profile) return;
      e.profile = updater(e.profile);
      bump(e);
    },
    [uid],
  );

  return {
    profile: entry.profile,
    loading: !entry.profile && !entry.error,
    error: entry.error,
    refresh,
    mutate,
  };
}
