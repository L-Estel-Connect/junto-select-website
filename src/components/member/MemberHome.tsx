"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import { requireFinalized } from "@/lib/introduction/completion";
import { primaryButtonClasses } from "@/lib/styles";
import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { useBilling } from "@/lib/billing/useBilling";
import { isEntitledStatus } from "@/lib/billing/types";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { useMemberQuery } from "@/lib/member/useMemberQuery";
import type { MemberLifecycleSummary } from "@/lib/matching/memberLifecycleTypes";
import { AUTOMATIC_INTRODUCTIONS_ENABLED } from "@/lib/matching/automaticIntroductions";
import { auth } from "@/lib/firebase/client";
import PrivateProfileView from "./PrivateProfileView";


/**
 * /member: sends an unfinished profile on to its next step, and otherwise
 * shows the private profile itself (PrivateProfileView), which is the
 * member area's home page.
 */
export default function MemberHome({ uid }: { uid: string }) {
  const router = useRouter();
  const { profile, error: profileError, refresh: refreshProfile } = useSharedProfile(uid);
  const { billing, loading: billingLoading } = useBilling(uid);
  // Proposals, invitations and connections belong to the automatic
  // introductions; while they're off the home shows the profile and
  // Reconnect only (see automaticIntroductions.ts).
  const summaryQuery = useMemberQuery(
    () =>
      AUTOMATIC_INTRODUCTIONS_ENABLED
        ? memberFetchJson<{ summary: MemberLifecycleSummary }>("/api/member/lifecycle-summary")
        : Promise.resolve({ summary: null as MemberLifecycleSummary | null }),
    [uid],
  );

  useEffect(() => {
    if (!profile) return;
    const redirect = requireFinalized(profile);
    if (!redirect) return;
    // A paying Select member who hasn't finished the introductions profile
    // (membership-first path) lands on the welcome page, which shows their
    // membership and event privilege alongside the "complete your profile"
    // step. Everyone else keeps going straight to onboarding, as before.
    if (billingLoading) return;
    // Exception: a "Búsqueda activa" profile that is complete and just paid
    // is confirmed on the profile page.
    const entitled = !!billing && isEntitledStatus(billing.status);
    const selectReady = profile.meta.requestedService === "select" && redirect === "/member/profile";
    router.replace(entitled && !selectReady ? "/member/bienvenida" : redirect);
  }, [profile, router, billing, billingLoading]);

  if (!profile) {
    if (profileError) {
      return <IntroductionError message={profileError} onRetry={() => void refreshProfile()} />;
    }
    return <IntroductionLoading />;
  }

  if (requireFinalized(profile)) {
    return <IntroductionLoading />;
  }

  const summary = summaryQuery.data?.summary ?? null;
  const pendingCount = summary
    ? summary.proposalsWaitingForDecision + summary.invitationsWaitingForDecision
    : 0;

  // The private profile is the home page. Proposals only exist while the
  // automatic introductions are switched on (off by default).
  return (
    <PrivateProfileView
      uid={uid}
      email={auth.currentUser?.email ?? null}
      notice={
        AUTOMATIC_INTRODUCTIONS_ENABLED && pendingCount > 0 ? (
          <div className="mt-8 rounded-md border border-[var(--laton,#cdbfad)] bg-white/60 p-6">
            <p className="text-[15px] font-medium text-ink">Tienes una propuesta esperando tu respuesta.</p>
            <Link href="/member/proposals" className={`${primaryButtonClasses} mt-4 inline-flex`}>
              Ver ahora
            </Link>
          </div>
        ) : null
      }
    />
  );
}
