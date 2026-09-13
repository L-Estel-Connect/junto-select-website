"use client";

import { useCallback, useSyncExternalStore } from "react";
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
 */

export type PhotoState =
  | { status: "loading" }
  | { status: "loaded"; url: string }
  | { status: "error"; error: string };

interface Entry {
  state: PhotoState;
  version: number;
  listeners: Set<() => void>;
}

const cache = new Map<string, Entry>();

function bump(entry: Entry) {
  entry.version += 1;
  entry.listeners.forEach((listener) => listener());
}

/** Starts (and dedupes) the actual Storage fetch for `path` — called at most once per path per session, regardless of how many components ask for it or how many times, concurrently or not. */
function startLoad(path: string): Entry {
  const entry: Entry = { state: { status: "loading" }, version: 0, listeners: new Set() };
  cache.set(path, entry);

  getBytes(ref(storage, path))
    .then((bytes) => {
      const blob = new Blob([bytes], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      entry.state = { status: "loaded", url };
      bump(entry);
    })
    .catch((error) => {
      // Every outcome reaches a terminal state — this is what keeps
      // "Cargando…" from ever being able to hang forever, the same
      // property the original single-component fix relied on, now
      // guaranteed once per path instead of once per component instance.
      console.error("Failed to load photo", path, error);
      entry.state = {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      bump(entry);
    });

  return entry;
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
  cache.set(path, { state: { status: "loaded", url }, version: 0, listeners: new Set() });
}

/** The path was deleted or is about to be replaced — never serve its (possibly now-dangling) cached bytes again. */
export function invalidatePhoto(path: string): void {
  const entry = cache.get(path);
  if (!entry) return;
  if (entry.state.status === "loaded") URL.revokeObjectURL(entry.state.url);
  cache.delete(path);
}

/** Revokes every cached object URL and empties the cache — session teardown / sign-out, so no private photo bytes linger in memory for whoever uses this tab next. */
export function clearPhotoCache(): void {
  for (const entry of cache.values()) {
    if (entry.state.status === "loaded") URL.revokeObjectURL(entry.state.url);
  }
  cache.clear();
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
    let entry = cache.get(path);
    if (!entry) entry = startLoad(path);
    entry.listeners.add(onStoreChange);
    return () => {
      entry!.listeners.delete(onStoreChange);
    };
  }, [path]);

  const getSnapshot = useCallback(() => cache.get(path)?.version ?? -1, [path]);

  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return cache.get(path)?.state ?? { status: "loading" };
}
