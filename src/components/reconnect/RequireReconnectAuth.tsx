"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/useAuth";
import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";

const AUTH_STALL_TIMEOUT_MS = 12000;

/**
 * The Reconnect tree's own auth guard — deliberately NOT
 * RequireIntroductionAuth and NOT useMemberProfile/requireFinalized: those
 * both assume (or require) a complete, finalized onboarding profile, which
 * a brand-new Reconnect participant (an "David" who never went through
 * Private Introductions onboarding) never has. This guard checks exactly
 * one thing — is someone signed in — mirroring RequireIntroductionAuth's
 * own loading/stall/redirect shape but with no completeness requirement at
 * all. See the audit: this is what makes it structurally impossible for an
 * incomplete Reconnect profile to get bounced into onboarding by a gate it
 * was never meant to pass.
 *
 * Shared by every page under `/reconnect/**` — the per-event Reconnect
 * experience (`nextPath="/reconnect/{eventId}"`) and the lightweight
 * accepted-connections surface (`nextPath="/reconnect/connections[...]"`,
 * see src/app/reconnect/connections) alike. `nextPath` is always passed by
 * the caller rather than built from an `eventId` here, since the
 * connections surface has no single event to anchor it to.
 */
export default function RequireReconnectAuth({
  nextPath,
  children,
}: {
  nextPath: string;
  children: (uid: string) => React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const timeoutId = setTimeout(() => setStalled(true), AUTH_STALL_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [loading]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/introduction?next=${nextPath}`);
    }
  }, [loading, user, router, nextPath]);

  if (stalled && loading) {
    return (
      <IntroductionError
        message="Esto está tardando más de lo normal. Inténtalo de nuevo."
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (loading || !user) {
    return <IntroductionLoading />;
  }

  return <>{children(user.uid)}</>;
}
