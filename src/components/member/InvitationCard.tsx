"use client";

import { useState } from "react";
import { memberFetch } from "@/lib/member/memberFetch";
import { memberDecisionErrorLabel } from "@/lib/member/errorLabels";
import { eyebrowClasses, primaryButtonClasses } from "@/lib/styles";
import type { MemberInvitationView } from "@/lib/matching/memberLifecycleTypes";
import PublicProfileCard from "./PublicProfileCard";

const secondaryButtonClasses =
  "inline-flex items-center justify-center rounded-full border border-ink px-9 py-4 text-[13px] font-medium uppercase tracking-[0.18em] text-ink transition-colors duration-200 hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Someone else was selected, said Interested, and is now waiting on THIS
 * member — shown identically whether this member is a paying active
 * searcher or a passive/free profile (see README "Free/passive behavior"):
 * responding here has never required membership, and this card never
 * mentions Plan/billing at all. Only ever rendered for stage "invited" or
 * "viewed" — a decided invitation is filtered out upstream
 * (ProposalsSection.tsx) since there's nothing left to respond to.
 */
export default function InvitationCard({
  invitation,
  onDecided,
}: {
  invitation: MemberInvitationView;
  onDecided: () => void;
}) {
  const [sending, setSending] = useState<"interested" | "passed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!invitation.inviter) {
    return (
      <div className="rounded-2xl border border-hairline bg-white p-6 text-center">
        <p className="text-[15px] text-ink-soft">Esta persona ya no está disponible.</p>
      </div>
    );
  }

  const name = invitation.inviter.firstName || "Alguien";

  async function decide(decision: "interested" | "passed") {
    setSending(decision);
    setError(null);
    try {
      const res = await memberFetch(`/api/member/invitations/${invitation.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "request_failed");
      onDecided();
    } catch (err) {
      setError(memberDecisionErrorLabel(err instanceof Error ? err.message : "request_failed"));
      setSending(null);
    }
  }

  return (
    <div className="rounded-2xl border border-rose bg-white p-6">
      <p className={eyebrowClasses}>Te han elegido</p>
      <p className="mt-3 max-w-[46ch] text-[18px] leading-snug text-ink">
        {name} está interesado/a en conocerte.
      </p>
      <p className="mt-1 text-[13px] text-ink-soft">Responder es gratis.</p>

      <div className="mt-6">
        <PublicProfileCard profile={invitation.inviter} />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[13px] text-[#8a3b3b]">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void decide("interested")}
          disabled={sending !== null}
          className={primaryButtonClasses}
        >
          {sending === "interested" ? "Enviando…" : "Me interesa"}
        </button>
        <button
          type="button"
          onClick={() => void decide("passed")}
          disabled={sending !== null}
          className={secondaryButtonClasses}
        >
          {sending === "passed" ? "Enviando…" : "Pasar"}
        </button>
      </div>
    </div>
  );
}
