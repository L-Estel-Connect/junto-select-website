"use client";

import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { useMemberProfile } from "./useMemberProfile";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { useMemberQuery } from "@/lib/member/useMemberQuery";
import type { MemberConnectionSummaryView } from "@/lib/matching/memberLifecycleTypes";
import ConnectionCard from "./ConnectionCard";

/**
 * The connections OVERVIEW — a scannable list of compact cards, never the
 * full profile/contact details inline (see ConnectionCard.tsx and
 * MemberConnectionSummaryView's own doc comment). Read-only, no chat (see
 * product principle: contact happens outside Junto Select once an
 * introduction exists). Opening a specific connection navigates to
 * /member/connections/[id], which fetches its own full detail.
 */
export default function ConnectionsSection({ uid }: { uid: string }) {
  const { ready, error, refresh } = useMemberProfile(uid);
  const introductionsQuery = useMemberQuery(
    () => memberFetchJson<{ introductions: MemberConnectionSummaryView[] }>("/api/member/introductions"),
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
    <div className="mx-auto flex w-full max-w-5xl flex-col px-6 py-14">
      <h1 className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Conexiones
      </h1>

      {introductions.length > 0 ? (
        // One card per row on mobile; 2 columns from `sm` up, 3 only once
        // there's genuinely enough width for it (`xl`) — a 3-column grid at
        // tablet/small-laptop widths would leave each card too cramped for
        // its name/city/status text.
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {introductions.map((introduction) => (
            <ConnectionCard key={introduction.id} connection={introduction} />
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
