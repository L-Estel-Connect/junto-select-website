"use client";

import Link from "next/link";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { useMemberQuery } from "@/lib/member/useMemberQuery";
import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import IntroductionCard from "@/components/member/IntroductionCard";
import type { MemberIntroductionView } from "@/lib/matching/memberLifecycleTypes";

const linkClasses = "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

/**
 * The lightweight, Reconnect-only DETAIL view — same `GET
 * /api/member/introductions/[id]` (unmodified) and the same `IntroductionCard`
 * (unmodified, full profile + revealed contacts) as `/member/connections/[id]`,
 * just without `useMemberProfile`'s finalized-profile gate. See the audit:
 * that gate was always client-side only — the API already re-verifies the
 * signed-in caller is a genuine party to this exact introduction before
 * returning anything, finalized or not.
 */
export default function ReconnectConnectionDetail({ id }: { id: string }) {
  const query = useMemberQuery(
    () => memberFetchJson<{ introduction: MemberIntroductionView }>(`/api/member/introductions/${id}`),
    [id],
  );

  return (
    <div className="mx-auto w-full max-w-[560px] px-6 py-14 sm:px-0">
      <Link href="/reconnect/connections" className={`text-sm ${linkClasses}`}>
        ← Volver a tus conexiones
      </Link>

      <div className="mt-8">
        {!query.data ? (
          query.error === "not_found" ? (
            <div className="flex min-h-[40svh] flex-col items-center justify-center gap-4 text-center">
              <p className="text-[15px] text-ink-soft">Esta conexión ya no está disponible.</p>
              <Link href="/reconnect/connections" className={`text-sm ${linkClasses}`}>
                Volver a tus conexiones
              </Link>
            </div>
          ) : query.error ? (
            <IntroductionError message={query.error} onRetry={() => query.reload()} />
          ) : (
            <IntroductionLoading />
          )
        ) : (
          <IntroductionCard introduction={query.data.introduction} />
        )}
      </div>
    </div>
  );
}
