"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/useAuth";
import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import DebugOverlay from "@/components/introduction/DebugOverlay";
import { logDebugEvent } from "@/lib/introduction/onboardingDebug";
import { MemberUidProvider } from "./MemberContext";
import MemberNav from "./MemberNav";

/**
 * Privacidad/Términos moved out of the primary header nav (which should
 * only show product destinations) and down here, same footer-style
 * treatment as the public site's own Footer.tsx — reachable on every
 * /member/** page without competing with the main nav for attention.
 */
function MemberFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-[1100px] items-center gap-4 px-6 py-6 sm:px-10">
        <Link href="/privacidad" className="text-[12px] text-ink-soft hover:text-ink">
          Privacidad
        </Link>
        <Link href="/terminos" className="text-[12px] text-ink-soft hover:text-ink">
          Términos de uso
        </Link>
      </div>
    </footer>
  );
}

// See RequireIntroductionAuth.tsx — same defensive timeout, applied to
// the /member tree's own independent auth guard.
const AUTH_STALL_TIMEOUT_MS = 12000;

/**
 * Auth guard + persistent nav for every /member/** page. Deliberately
 * light: it only checks sign-in state and provides the uid via context —
 * each page still fetches and guards on the profile itself (same pattern
 * as before), so this doesn't introduce a second, competing source of
 * profile state.
 */
export default function MemberShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const timeoutId = setTimeout(() => {
      logDebugEvent("AUTH_STALLED", `/member — no resolution after ${AUTH_STALL_TIMEOUT_MS}ms`);
      setStalled(true);
    }, AUTH_STALL_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [loading]);

  useEffect(() => {
    // See RequireIntroductionAuth.tsx — same `?session=expired` signal so
    // the landing page can explain why someone was sent back here instead
    // of silently bouncing them with no context.
    if (!loading && !user) {
      router.replace("/introduction?session=expired");
    }
  }, [loading, user, router]);

  // See RequireIntroductionAuth.tsx for why this is gated on `loading` too.
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
    <MemberUidProvider value={user.uid}>
      <DebugOverlay />
      <div className="flex min-h-svh flex-col">
        <MemberNav />
        <div className="flex-1">{children}</div>
        <MemberFooter />
      </div>
    </MemberUidProvider>
  );
}
