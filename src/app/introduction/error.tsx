"use client";

import { useEffect } from "react";
import { IntroductionError } from "@/components/introduction/RequireIntroductionAuth";
import { logDebugEvent } from "@/lib/introduction/onboardingDebug";

/**
 * Next.js App Router error boundary for every /introduction/** route.
 * Without this, a render-time crash anywhere in that tree (e.g. a
 * malformed/legacy-shaped Firestore document reaching an assumption the
 * code makes about its own data) has no defined fallback and can present
 * as a blank or frozen page — exactly the class of failure this incident
 * needs ruled out, alongside the async-hang class already fixed in
 * profileCache.ts/photoCache.ts. `reset()` re-renders this segment from
 * scratch, which is the right "retry" for a crash (unlike a stalled
 * fetch, there's no in-flight request to just wait out).
 */
export default function IntroductionErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logDebugEvent("RENDER_ERROR", error.message);
    console.error("Introduction route crashed:", error);
  }, [error]);

  return (
    <IntroductionError
      message="Algo ha ido mal al cargar tu perfil. Inténtalo de nuevo."
      onRetry={reset}
    />
  );
}
