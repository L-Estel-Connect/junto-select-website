"use client";

import { useEffect, useState, type DependencyList } from "react";

/**
 * Shared data-fetching hook for admin pages — every setState call happens
 * inside the fetch promise's .then/.catch (an async continuation), never
 * synchronously in the effect body itself, matching the pattern already
 * used by useMemberProfile.ts elsewhere in this app (and required by the
 * react-hooks/set-state-in-effect lint rule). `data` intentionally keeps
 * showing the previous result while a refetch is in flight, rather than
 * flashing back to a loading state — call `reload()` after a mutation to
 * refresh in place.
 */
export function useAdminQuery<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  return { data, error, reload: () => setReloadKey((k) => k + 1) };
}
