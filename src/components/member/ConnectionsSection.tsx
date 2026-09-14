"use client";

import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { useMemberProfile } from "./useMemberProfile";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { useMemberQuery } from "@/lib/member/useMemberQuery";
import type { MemberIntroductionView } from "@/lib/matching/memberLifecycleTypes";
import IntroductionCard from "./IntroductionCard";

/**
 * Real mutual introductions — read-only, no chat (see product principle:
 * contact happens outside Junto Select once an introduction exists).
 */
export default function ConnectionsSection({ uid }: { uid: string }) {
  const { ready, error, refresh } = useMemberProfile(uid);
  const introductionsQuery = useMemberQuery(
    () => memberFetchJson<{ introductions: MemberIntroductionView[] }>("/api/member/introductions"),
    [uid],
  );

  if (!ready) {
    if (error) return <IntroductionError message={error} onRetry={() => void refresh()} />;
    return <IntroductionLoading />;
  }

  const loading = !introductionsQuery.data && !introductionsQuery.error;
  if (loading) return <IntroductionLoading />;
  if (introductionsQuery.error) {
    return (
      <IntroductionError
        message={introductionsQuery.error}
        onRetry={() => introductionsQuery.reload()}
      />
    );
  }

  const introductions = introductionsQuery.data?.introductions ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-6 py-14 sm:px-0">
      <h1 className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Conexiones
      </h1>

      {introductions.length > 0 ? (
        <div className="mt-10 space-y-6">
          {introductions.map((introduction) => (
            <IntroductionCard key={introduction.id} introduction={introduction} />
          ))}
        </div>
      ) : (
        <div className="mt-14 flex min-h-[30svh] flex-col items-center justify-center text-center">
          <p className="text-[16px] text-ink">Todavía no tienes ninguna introducción.</p>
          <p className="mt-2 max-w-[38ch] text-[15px] leading-relaxed text-ink-soft">
            Cuando tú y otra persona os interesa mutuamente, aparecerá aquí.
          </p>
        </div>
      )}
    </div>
  );
}
