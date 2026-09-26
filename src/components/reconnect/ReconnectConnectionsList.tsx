"use client";

import { memberFetchJson } from "@/lib/member/memberFetch";
import { useMemberQuery } from "@/lib/member/useMemberQuery";
import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import ConnectionCard from "@/components/member/ConnectionCard";
import type { MemberConnectionSummaryView } from "@/lib/matching/memberLifecycleTypes";

/**
 * The lightweight, Reconnect-only overview list — deliberately the SAME
 * data (`GET /api/member/introductions`, unmodified, no `onboardingFinalized`
 * check server-side — see the audit) and the SAME `ConnectionCard` as
 * `/member/connections`'s `ConnectionsSection`, just reached without
 * `useMemberProfile`'s finalized-profile gate and without `MemberShell`'s
 * full nav (Mi perfil / Mis selecciones / Mi plan — none of which make
 * sense for someone who never finished onboarding). This is NOT a second
 * connections system: it's the identical IntroductionDocument-backed list,
 * presented through a narrower door.
 */
export default function ReconnectConnectionsList({ uid }: { uid: string }) {
  const query = useMemberQuery(
    () => memberFetchJson<{ introductions: MemberConnectionSummaryView[] }>("/api/member/introductions"),
    [uid],
  );

  if (!query.data) {
    if (query.error) return <IntroductionError message={query.error} onRetry={() => query.reload()} />;
    return <IntroductionLoading />;
  }

  const introductions = query.data.introductions;

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col px-6 py-14">
      <h1 className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">Tus conexiones</h1>
      <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
        Las personas con las que has conectado a través de Reconnect.
      </p>

      {introductions.length > 0 ? (
        <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),380px))] gap-4">
          {introductions.map((introduction) => (
            <ConnectionCard key={introduction.id} connection={introduction} basePath="/reconnect/connections" />
          ))}
        </div>
      ) : (
        <div className="mt-14 flex min-h-[30svh] flex-col items-center justify-center text-center">
          <p className="text-[16px] text-ink">Todavía no tienes ninguna conexión.</p>
          <p className="mt-2 max-w-[38ch] text-[15px] leading-relaxed text-ink-soft">
            Cuando alguien acepte tu solicitud de Reconnect, aparecerá aquí.
          </p>
        </div>
      )}
    </div>
  );
}
