"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getBytes, ref } from "firebase/storage";
import { storage } from "@/lib/firebase/client";
import { watchAuthState } from "@/lib/firebase/auth";

/**
 * One shared, in-memory cache of decoded photo bytes (as object URLs),
 * keyed by Storage path, for the lifetime of the browser tab/session.
 *
 * Fixes the "existing photos are fully re-downloaded on every page" finding
 * from the perf diagnostic: previously each `PrivatePhotoThumbnail` owned
 * its own effect and its own `getBytes()` call, so navigating from the
 * profile card to the photo-editing grid (or back) re-fetched the exact
 * same bytes from Storage every time. Now a photo's bytes are fetched
 * ONCE per path per session; every component that displays that path
 * afterward (anywhere in the app, at any time) reuses the same object URL.
 *
 * Deliberately never revokes an object URL just because a component
 * unmounts — that would defeat the entire point (revisiting a photo page
 * would re-download it again). An entry is only ever discarded by
 * `invalidatePhoto` (the path was deleted/replaced and must never be
 * served again) or `clearPhotoCache` (session teardown / sign-out), both
 * of which explicitly revoke the URL at that point. A briefly-still-
 * mounted `<img>` pointing at a just-revoked URL simply shows nothing
 * until React re-renders it away (delete/replace already trigger that
 * re-render via the profile cache's `mutate`), which is an acceptable,
 * momentary cosmetic edge case — not a memory-safety or correctness one.
 *
 * IMPORTANT — self-healing design (fixed after a production incident):
 * see the matching comment in profileCache.ts. The same bug existed here:
 * a fetch only ever started inside `subscribe` (called once per mount),
 * so a cache clear mid-flight left a mounted `PrivatePhotoThumbnail`
 * stuck showing "Cargando…" forever even though the original Storage
 * request had already completed successfully. Fixed the same way: a
 * single global version counter for every snapshot, `clearPhotoCache`
 * explicitly notifying every previously-registered listener, and a
 * dependency-free `useEffect` that re-arms a stalled entry on any render.
 */

export type PhotoState =
  | { status: "loading" }
  | { status: "loaded"; url: string }
  | { status: "error"; error: string };

interface Entry {
  state: PhotoState;
  // Distinct from `state.status === "loading"`, which is also true for
  // an entry that exists but has never actually been dispatched yet
  // (e.g. one `getOrCreateEntry` just created for a new subscriber). The
  // self-healing effect below needs to tell "loading because a fetch is
  // genuinely in flight" apart from "loading because nothing has started
  // one yet" — without this flag it would either never start the very
  // first fetch, or start a duplicate one on every render.
  fetching: boolean;
  listeners: Set<() => void>;
}

const cache = new Map<string, Entry>();

// See profileCache.ts: a single global counter, not a per-entry one, so
// swapping an entry out (e.g. on clearPhotoCache) is always detected as
// a change instead of possibly matching the old value by coincidence.
let globalVersion = 0;

// A fetch pending longer than this is surfaced as a recoverable error
// instead of an indefinite spinner. The underlying request is never
// aborted — a late success still lands and clears the error normally.
const STALL_TIMEOUT_MS = 12000;

function notify(entry: Entry) {
  globalVersion += 1;
  entry.listeners.forEach((listener) => listener());
}

function getOrCreateEntry(path: string): Entry {
  let entry = cache.get(path);
  if (!entry) {
    entry = { state: { status: "loading" }, fetching: false, listeners: new Set() };
    cache.set(path, entry);
  }
  return entry;
}

/** Starts (and dedupes) the actual Storage fetch for `path` — called at most once per path per session, regardless of how many components ask for it or how many times, concurrently or not. */
function startLoad(path: string): void {
  const entry = getOrCreateEntry(path);
  if (entry.fetching) return;
  entry.fetching = true;
  entry.state = { status: "loading" };
  notify(entry);

  let settled = false;
  const timeoutId = setTimeout(() => {
    if (!settled) {
      entry.state = {
        status: "error",
        error: "Esto está tardando más de lo normal. Inténtalo de nuevo.",
      };
      notify(entry);
    }
  }, STALL_TIMEOUT_MS);

  getBytes(ref(storage, path))
    .then((bytes) => {
      const blob = new Blob([bytes], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      entry.state = { status: "loaded", url };
    })
    .catch((error) => {
      // Every outcome reaches a terminal state — this is what keeps
      // "Cargando…" from ever being able to hang forever.
      console.error("Failed to load photo", path, error);
      entry.state = {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    })
    .finally(() => {
      settled = true;
      clearTimeout(timeoutId);
      entry.fetching = false;
      notify(entry);
    });
}

/**
 * Seeds the cache directly from bytes already available locally (the file
 * just processed for upload), skipping the network round-trip entirely for
 * a photo the browser already has in memory. Only takes effect if nothing
 * is cached yet for this path (a freshly-generated upload id never
 * collides with anything), so it can never shadow real Storage content.
 */
export function seedPhotoCache(path: string, blob: Blob): void {
  if (cache.has(path)) return;
  const url = URL.createObjectURL(blob);
  cache.set(path, { state: { status: "loaded", url }, fetching: false, listeners: new Set() });
}

/** Discards a failed (or stalled) entry and starts a fresh fetch — the retry action behind the "No se pudo cargar la foto" state's retry button. */
export function retryPhoto(path: string): void {
  const entry = cache.get(path);
  if (entry && entry.state.status !== "error") return;
  cache.delete(path);
  startLoad(path);
}

/** The path was deleted or is about to be replaced — never serve its (possibly now-dangling) cached bytes again. */
export function invalidatePhoto(path: string): void {
  const entry = cache.get(path);
  if (!entry) return;
  if (entry.state.status === "loaded") URL.revokeObjectURL(entry.state.url);
  cache.delete(path);
  globalVersion += 1;
  entry.listeners.forEach((listener) => listener());
}

/**
 * Revokes every cached object URL and resets every entry — session
 * teardown / sign-out, so no private photo bytes linger in memory for
 * whoever uses this tab next.
 *
 * Resets each entry's fields IN PLACE rather than removing it from the
 * map — see the matching comment on `clearProfileCache` in
 * profileCache.ts for why this is load-bearing, not a style choice: a
 * mounted `PrivatePhotoThumbnail`'s listener is attached to one specific
 * entry object at mount and never re-attached just because a render
 * happens, so discarding that object would leave any later replacement's
 * eventual result with no one to notify.
 */
export function clearPhotoCache(): void {
  for (const entry of cache.values()) {
    if (entry.state.status === "loaded") URL.revokeObjectURL(entry.state.url);
    entry.state = { status: "loading" };
    entry.fetching = false;
  }
  globalVersion += 1;
  cache.forEach((entry) => entry.listeners.forEach((listener) => listener()));
}

let watcherStarted = false;
function ensureAuthWatcher() {
  if (watcherStarted || typeof window === "undefined") return;
  watcherStarted = true;
  watchAuthState((user) => {
    if (!user) clearPhotoCache();
  });
}

/**
 * Subscribes to `path`'s cached load state, triggering the fetch at most
 * once (shared across every concurrent/future subscriber for the same
 * path — this is what "multiple simultaneous components requesting the
 * same photo produce only one Storage fetch" means in practice: they all
 * resolve the same already-existing cache entry instead of each starting
 * their own).
 */
export function usePhotoState(path: string): PhotoState {
  ensureAuthWatcher();

  const subscribe = useCallback((onStoreChange: () => void) => {
    const entry = getOrCreateEntry(path);
    entry.listeners.add(onStoreChange);
    return () => {
      entry.listeners.delete(onStoreChange);
    };
  }, [path]);

  const getSnapshot = useCallback(() => globalVersion, []);

  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const entry = getOrCreateEntry(path);

  // Self-healing: re-checked after every render (mount, a version bump
  // from elsewhere, or a cache clear), not only once at initial
  // subscribe time — see the file-level comment. Checking `fetching`
  // (not just `cache.has(path)`) is what makes this correct: an entry
  // that merely exists but was never dispatched (state "loading",
  // fetching false — e.g. one just created above, or one left behind by
  // a cache clear) still needs `startLoad`; one that's genuinely in
  // flight (fetching true) must not be re-triggered.
  useEffect(() => {
    if (entry.state.status === "loading" && !entry.fetching) {
      startLoad(path);
    }
  });

  return entry.state;
}
