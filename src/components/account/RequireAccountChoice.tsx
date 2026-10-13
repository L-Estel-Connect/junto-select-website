"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";

/**
 * For signed-in pages that would otherwise create a profile on first read
 * (the questionnaire and the member area): an account that has neither a
 * profile nor a membership is sent to "Tu cuenta" to choose first, so a
 * profile is never created just by opening a page. Fails open on a network
 * error, as before this guard existed.
 */
export default function RequireAccountChoice({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    memberFetchJson<{ hasProfile: boolean; entitled: boolean }>("/api/account/status")
      .then((s) => {
        if (cancelled) return;
        if (s.hasProfile || s.entitled) setAllowed(true);
        else router.replace("/introduction");
      })
      .catch(() => {
        if (!cancelled) setAllowed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return allowed ? <>{children}</> : <IntroductionLoading />;
}
