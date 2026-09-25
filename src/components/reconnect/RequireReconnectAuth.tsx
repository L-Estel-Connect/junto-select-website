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
 */
export default function RequireReconnectAuth({
  eventId,
  children,
}: {
  eventId: string;
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
      router.replace(`/introduction?next=/reconnect/${eventId}`);
    }
  }, [loading, user, router, eventId]);

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
