"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/useAuth";
import { IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { MemberUidProvider } from "./MemberContext";
import MemberNav from "./MemberNav";

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

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/introduction");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return <IntroductionLoading />;
  }

  return (
    <MemberUidProvider value={user.uid}>
      <div className="flex min-h-svh flex-col">
        <MemberNav />
        <div className="flex-1">{children}</div>
      </div>
    </MemberUidProvider>
  );
}
