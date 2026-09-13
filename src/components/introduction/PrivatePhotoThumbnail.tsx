"use client";

import { usePhotoState } from "@/lib/introduction/photoCache";

/**
 * Renders a private profile photo from the shared photo cache (see
 * photoCache.ts) — bytes are fetched via the authenticated Storage SDK
 * (rule-checked) at most once per path per session, regardless of how many
 * times or how many places this path is displayed. No per-component
 * fetch/effect/object-URL lifecycle here anymore; the cache owns all of
 * that, which is also what makes this safe under React Strict Mode's
 * double-invoked effects (mount/unmount/remount reuses the same cache
 * entry instead of re-fetching and revoking).
 */
export default function PrivatePhotoThumbnail({
  path,
  primary,
}: {
  path: string;
  primary?: boolean;
}) {
  const state = usePhotoState(path);

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-hairline/40">
      {state.status === "loaded" && (
        // Object URLs aren't compatible with next/image's optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={state.url} alt="" className="h-full w-full object-cover" />
      )}
      {state.status === "loading" && (
        <div className="flex h-full w-full items-center justify-center">
          <p className="text-xs text-ink-soft">Cargando…</p>
        </div>
      )}
      {state.status === "error" && (
        <div className="flex h-full w-full items-center justify-center px-3 text-center">
          <p className="text-xs text-ink-soft">No se pudo cargar la foto.</p>
        </div>
      )}
      {primary && (
        <span className="absolute left-2 top-2 rounded-full bg-paper/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-ink">
          Principal
        </span>
      )}
    </div>
  );
}
