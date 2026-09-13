"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/useAuth";
import { logDebugEvent } from "@/lib/introduction/onboardingDebug";
import DebugOverlay from "./DebugOverlay";

// How long auth resolution may stay pending before showing a recoverable
// error/retry state instead of an indefinite spinner — mirrors the same
// STALL_TIMEOUT_MS in profileCache.ts/photoCache.ts, applied to the one
// loading phase upstream of both that previously had no timeout at all.
const AUTH_STALL_TIMEOUT_MS = 12000;

export function IntroductionLoading() {
  return (
    <div className="flex min-h-[70svh] items-center justify-center">
      <p className="text-sm text-ink-soft">Cargando…</p>
    </div>
  );
}

/**
 * The defensive failure state every profile/photo loading gate must show
 * instead of an indefinite spinner: a stalled or failed fetch (see
 * profileCache.ts / photoCache.ts) surfaces here with a way to try again,
 * rather than leaving the person stuck on "Cargando…" forever.
 */
export function IntroductionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-[70svh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-ink-soft">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-hairline px-5 py-2 text-sm text-ink transition-colors hover:bg-hairline/30"
      >
        Reintentar
      </button>
    </div>
  );
}

/**
 * Shared guard for every page under /introduction that requires a signed-in
 * user (onboarding, Profile Home, Fotos, Lo que buscas, Tu presentación).
 * Redirects to /introduction when there's definitively no user, and shows
 * a loading state in between — never the signed-out screen — while that's
 * still being determined.
 *
 * Also the one place `<DebugOverlay />` is mounted for the /introduction
 * tree, so it's visible from the very first paint — before a uid even
 * exists, covering the auth-resolution phase that every downstream
 * profile/photo event depends on.
 */
export default function RequireIntroductionAuth({
  children,
}: {
  children: (uid: string) => React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const timeoutId = setTimeout(() => {
      logDebugEvent("AUTH_STALLED", `no resolution after ${AUTH_STALL_TIMEOUT_MS}ms`);
      setStalled(true);
    }, AUTH_STALL_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [loading]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/introduction");
    }
  }, [loading, user, router]);

  // Gated on `loading` too (not just the `stalled` flag alone) so that if
  // auth resolves normally after a stall was recorded, the error state
  // never lingers — there's no separate "reset" path to keep in sync.
  if (stalled && loading) {
    return (
      <>
        <DebugOverlay />
        <IntroductionError
          message="Esto está tardando más de lo normal. Inténtalo de nuevo."
          onRetry={() => window.location.reload()}
        />
      </>
    );
  }

  if (loading || !user) {
    return (
      <>
        <DebugOverlay />
        <IntroductionLoading />
      </>
    );
  }

  return (
    <>
      <DebugOverlay />
      {children(user.uid)}
    </>
  );
}
