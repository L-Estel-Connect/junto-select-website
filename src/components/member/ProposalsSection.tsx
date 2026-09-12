"use client";

import { IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { useMemberProfile } from "./useMemberProfile";

/**
 * Structure-only for now — no matching engine exists yet. Once it does,
 * this is where "Nuevas" / "Interesadas · Pendientes" / "Pasadas"
 * sections would go, each backed by real proposal documents; there's
 * nothing to model yet, so this deliberately stays a single empty state
 * rather than three empty sections.
 */
export default function ProposalsSection({ uid }: { uid: string }) {
  const { ready } = useMemberProfile(uid);
  if (!ready) return <IntroductionLoading />;

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-6 py-14 sm:px-0">
      <h1 className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Mis propuestas
      </h1>
      <div className="mt-14 flex min-h-[30svh] flex-col items-center justify-center text-center">
        <p className="text-[16px] text-ink">Todavía no tienes propuestas.</p>
        <p className="mt-2 max-w-[38ch] text-[15px] leading-relaxed text-ink-soft">
          Cuando encontremos a alguien que encaje contigo, aparecerá aquí.
        </p>
      </div>
    </div>
  );
}
