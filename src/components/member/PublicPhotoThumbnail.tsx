"use client";

import { useEffect, useState } from "react";
import { memberFetch } from "@/lib/member/memberFetch";

/**
 * Renders ANOTHER member's photo (a proposal's candidate, an invitation's
 * inviter, an introduction's other party) — never the signed-in member's
 * own, which stays on PrivatePhotoThumbnail/photoCache.ts's direct
 * Storage-SDK path. storage.rules is owner-only, so this photo can only
 * ever be reached through /api/member/photo, which re-derives whether the
 * viewer is actually authorized (see isAuthorizedToViewProfile) before
 * streaming any bytes. Deliberately no cross-component cache like
 * photoCache.ts: this only ever renders a handful of photos at a time (one
 * proposal/invitation/introduction card's worth), so the added complexity
 * of a shared cache isn't worth it for V1.
 *
 * Callers key this component by `path` (see PublicProfileCard.tsx) rather
 * than this component resetting its own state when `path` changes — that
 * gives every distinct photo a fresh mount (and therefore a fresh initial
 * "loading" state) for free, without ever calling setState synchronously
 * inside the effect body.
 */
export default function PublicPhotoThumbnail({ path, primary }: { path: string; primary?: boolean }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "loaded"; url: string } | { status: "error" }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    memberFetch(`/api/member/photo?path=${encodeURIComponent(path)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: "loaded", url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

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
