"use client";

import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { useMemberProfile } from "./useMemberProfile";

/**
 * Structure-only — mutual-interest and contact-reveal logic don't exist
 * yet. Once they do, an accepted proposal on both sides becomes a
 * connection here, and that's the point contact details (see
 * ContactPreferences) would actually get revealed.
 */
export default function ConnectionsSection({ uid }: { uid: string }) {
  const { ready, error, refresh } = useMemberProfile(uid);
  if (!ready) {
    if (error) return <IntroductionError message={error} onRetry={() => void refresh()} />;
    return <IntroductionLoading />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-6 py-14 sm:px-0">
      <h1 className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Conexiones
      </h1>
      <div className="mt-14 flex min-h-[30svh] flex-col items-center justify-center text-center">
        <p className="text-[16px] text-ink">Aún no tienes conexiones.</p>
        <p className="mt-2 max-w-[38ch] text-[15px] leading-relaxed text-ink-soft">
          Cuando tú y otra persona os interesa mutuamente, aparecerá aquí.
        </p>
      </div>
    </div>
  );
}
