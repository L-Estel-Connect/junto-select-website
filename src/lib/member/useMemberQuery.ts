"use client";

import { useEffect, useState, type DependencyList } from "react";

/**
 * Shared data-fetching hook for the member lifecycle pages — identical
 * shape and behavior to admin's useAdminQuery.ts (kept as a separate small
 * file rather than a shared import so the member and admin surfaces stay
 * fully independent). `data` keeps showing the previous result while a
 * refetch is in flight, rather than flashing back to a loading state — a
 * caller treats `data === null && error === null` as "loading" (same
 * convention as useMemberProfile.ts's `ready`). Call `reload()` after a
 * decision to refresh in place.
 */
export function useMemberQuery<T>(
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
