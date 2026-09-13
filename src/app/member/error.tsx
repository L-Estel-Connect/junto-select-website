"use client";

import { useEffect } from "react";
import { IntroductionError } from "@/components/introduction/RequireIntroductionAuth";
import { logDebugEvent } from "@/lib/introduction/onboardingDebug";

/** See src/app/introduction/error.tsx — identical rationale, for /member/**. */
export default function MemberErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logDebugEvent("RENDER_ERROR", error.message);
    console.error("Member route crashed:", error);
  }, [error]);

  return (
    <IntroductionError
      message="Algo ha ido mal al cargar tu perfil. Inténtalo de nuevo."
      onRetry={reset}
    />
  );
}
