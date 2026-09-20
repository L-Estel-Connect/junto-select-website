"use client";

import { use } from "react";
import Link from "next/link";
import Section from "@/components/Section";
import IntroductionCard from "@/components/member/IntroductionCard";
import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { useMemberProfile } from "@/components/member/useMemberProfile";
import { useMemberUid } from "@/components/member/MemberContext";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { useMemberQuery } from "@/lib/member/useMemberQuery";
import type { MemberIntroductionView } from "@/lib/matching/memberLifecycleTypes";

const linkClasses = "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

/**
 * The DETAIL page for one connection — the full profile, photos, facts,
 * AI presentation, and legitimately revealed contact methods, exactly as
 * IntroductionCard already renders them (reused unchanged, not rebuilt).
 * /member/connections itself only ever shows the compact ConnectionCard
 * overview; this is where the complete picture lives, fetched fresh via
 * GET /api/member/introductions/[id] — which independently re-verifies
 * the signed-in member is a genuine party to this exact introduction
 * before returning anything (see getIntroductionDetailForMember).
 */
export default function ConnectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const uid = useMemberUid();
  const { ready, error: profileError, refresh } = useMemberProfile(uid);

  const detailQuery = useMemberQuery(
    () => memberFetchJson<{ introduction: MemberIntroductionView }>(`/api/member/introductions/${id}`),
    [uid, id],
  );

  if (!ready) {
    if (profileError) return <IntroductionError message={profileError} onRetry={() => void refresh()} />;
    return <IntroductionLoading />;
  }

  const loading = !detailQuery.data && !detailQuery.error;

  return (
    <Section as="main" size="sm">
      <div className="mx-auto w-full max-w-[560px] px-6 py-14 sm:px-0">
        <Link href="/member/connections" className={`text-sm ${linkClasses}`}>
          ← Volver a Conexiones
        </Link>

        <div className="mt-8">
          {loading ? (
            <IntroductionLoading />
          ) : detailQuery.error === "not_found" ? (
            <div className="flex min-h-[40svh] flex-col items-center justify-center gap-4 text-center">
              <p className="text-[15px] text-ink-soft">Esta conexión ya no está disponible.</p>
              <Link href="/member/connections" className={`text-sm ${linkClasses}`}>
                Volver a Conexiones
              </Link>
            </div>
          ) : detailQuery.error ? (
            <IntroductionError message={detailQuery.error} onRetry={() => detailQuery.reload()} />
          ) : detailQuery.data ? (
            <IntroductionCard introduction={detailQuery.data.introduction} />
          ) : null}
        </div>
      </div>
    </Section>
  );
}
