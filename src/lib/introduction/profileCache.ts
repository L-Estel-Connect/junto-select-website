"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getOrCreateProfile } from "./profile";
import { watchAuthState } from "@/lib/firebase/auth";
import { logDebugEvent } from "./onboardingDebug";
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
 *
 * IMPORTANT — self-healing design (fixed after a production incident):
 * an earlier version only ever started a fetch from inside `subscribe`,
 * which React calls once per mount while `uid` stays the same. If the
 * whole cache was ever cleared (see `clearProfileCache`) while a
 * component was already mounted and subscribed — e.g. a stray/duplicate
 * `onAuthStateChanged` callback firing after the auth watcher below was
 * registered — that component's entry was silently swapped for a fresh,
 * never-fetched one, and nothing ever started a new fetch for it: the
 * page was stuck on "Cargando…" forever with a fully successful,
 * completed network request behind it. Two changes fix this permanently:
 * (1) a single global version counter (not a per-entry one) is used for
 * every snapshot, so swapping an entry for a new one is *always* seen as
 * a change, never coincidentally mistaken for "nothing changed"; (2) the
 * "start a fetch if this entry needs one" check now runs from a
 * dependency-free `useEffect` on every render, not only inside
 * `subscribe` — so any render (for any reason) re-arms a stalled entry.
 */

interface CacheEntry {
  profile: ProfileDocument | null;
  error: string | null;
  promise: Promise<void> | null;
  listeners: Set<() => void>;
}

const cache = new Map<string, CacheEntry>();

// Bumped on every mutation anywhere in this cache and used as the ONLY
// value useSyncExternalStore compares — see the note above on why a
// per-entry counter isn't safe once entries can be replaced wholesale.
let globalVersion = 0;

// How long a fetch may be pending before a mounted consumer is shown a
// recoverable error/retry state instead of an indefinite spinner. The
// underlying fetch is never aborted — if it resolves after the timeout,
// the result still lands normally and clears the error.
const STALL_TIMEOUT_MS = 12000;

function getEntry(uid: string): CacheEntry {
  let entry = cache.get(uid);
  if (!entry) {
    entry = { profile: null, error: null, promise: null, listeners: new Set() };
    cache.set(uid, entry);
  }
  return entry;
}

function notify(entry: CacheEntry) {
  globalVersion += 1;
  entry.listeners.forEach((listener) => listener());
}

function load(uid: string, force: boolean): Promise<void> {
  const entry = getEntry(uid);
  if (entry.promise && !force) return entry.promise;

  logDebugEvent("PROFILE_FETCH_STARTED", `force=${force}`);

  let settled = false;
  const timeoutId = setTimeout(() => {
    if (!settled) {
      logDebugEvent("PROFILE_FETCH_STALLED", `no response after ${STALL_TIMEOUT_MS}ms`);
      entry.error = "Esto está tardando más de lo normal. Inténtalo de nuevo.";
      notify(entry);
    }
  }, STALL_TIMEOUT_MS);

  entry.promise = getOrCreateProfile(uid)
    .then((doc) => {
      logDebugEvent("PROFILE_FETCH_RESOLVED", "ok");
      entry.profile = doc;
      entry.error = null;
    })
    .catch((err) => {
      // Every outcome reaches a terminal state — a rejected read is
      // remembered as an error rather than leaving `profile` unset with
      // no signal, which previously could leave a page on its loading
      // screen forever with no way out.
      logDebugEvent(
        "PROFILE_FETCH_RESOLVED",
        `error: ${err instanceof Error ? err.message : String(err)}`,
      );
      entry.error = err instanceof Error ? err.message : "No hemos podido cargar tu perfil.";
    })
    .finally(() => {
      settled = true;
      clearTimeout(timeoutId);
      entry.promise = null;
      logDebugEvent("CACHE_UPDATED", entry.profile ? "profile set" : `error=${entry.error}`);
      notify(entry);
    });
  return entry.promise;
}

/**
 * Discards every cached profile — called automatically whenever Firebase
 * Auth reports no signed-in user (explicit sign-out, or session loss), so
 * no private profile data lingers in memory for whoever uses this
 * tab/browser next.
 *
 * Resets each entry's fields IN PLACE rather than removing it from the
 * map — this is deliberate and load-bearing, not a style choice. A
 * mounted component's `subscribe` attaches its listener to one specific
 * entry OBJECT exactly once (at mount, or the last time `path`/`uid`
 * changed) and is never called again just because a render happened —
 * so if a clear discarded that object and something later created a
 * *replacement* object for the same key (which the self-healing effect
 * below would, to restart the fetch), the replacement's listeners set
 * would be empty and its eventual result would notify no one — a second,
 * more subtle version of the exact "successful fetch, no one told React"
 * bug this file exists to fix. Reusing the same object means every
 * previously-attached listener stays valid no matter how many times an
 * entry is reset and re-fetched during a component's lifetime.
 */
export function clearProfileCache(): void {
  for (const entry of cache.values()) {
    entry.profile = null;
    entry.error = null;
    entry.promise = null;
  }
  globalVersion += 1;
  cache.forEach((entry) => entry.listeners.forEach((listener) => listener()));
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
      return () => {
        entry.listeners.delete(onStoreChange);
      };
    },
    [uid],
  );
  const getSnapshot = useCallback(() => globalVersion, []);

  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const entry = getEntry(uid);
  const loading = !entry.profile && !entry.error;

  // Effects (not render-time ref checks) so this logs once per actual
  // transition: React re-runs an effect only when a listed dependency's
  // value actually changes, which naturally dedupes against the far more
  // frequent render/getSnapshot calls.
  useEffect(() => {
    logDebugEvent("HOOK_SNAPSHOT_RECEIVED", `profile=${Boolean(entry.profile)} error=${Boolean(entry.error)}`);
  }, [entry.profile, entry.error]);
  useEffect(() => {
    if (!loading) logDebugEvent("PROFILE_LOADING_FALSE", entry.error ? "error" : "profile ready");
  }, [loading, entry.error]);

  // Self-healing: re-checked after every render (mount, a version bump
  // from elsewhere, or a cache clear), not only once at initial
  // subscribe time — see the file-level comment for why this is what
  // makes a mid-flight cache clear recoverable instead of an eternal
  // spinner. Idempotent: a fetch already in flight (entry.promise set)
  // is left alone.
  useEffect(() => {
    if (!entry.profile && !entry.error && !entry.promise) {
      void load(uid, false);
    }
  });

  const refresh = useCallback(() => load(uid, true), [uid]);
  const mutate = useCallback(
    (updater: (prev: ProfileDocument) => ProfileDocument) => {
      const e = getEntry(uid);
      if (!e.profile) return;
      e.profile = updater(e.profile);
      notify(e);
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
