"use client";

import { useEffect, useState } from "react";
import { getPhotoObjectUrl } from "@/lib/introduction/photos";

/**
 * Renders a private profile photo by fetching its bytes through the
 * authenticated Storage SDK (rule-checked) rather than a public download
 * URL — see photos.ts for why. Manages its own object URL lifecycle.
 */
export default function PrivatePhotoThumbnail({
  path,
  primary,
}: {
  path: string;
  primary?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    getPhotoObjectUrl(path).then((next) => {
      if (cancelled) {
        URL.revokeObjectURL(next);
        return;
      }
      objectUrl = next;
      setUrl(next);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-hairline/40">
      {url ? (
        // Object URLs aren't compatible with next/image's optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <p className="text-xs text-ink-soft">Cargando…</p>
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
