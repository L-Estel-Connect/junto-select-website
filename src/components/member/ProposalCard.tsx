"use client";

import { useState } from "react";
import { memberFetch } from "@/lib/member/memberFetch";
import { memberDecisionErrorLabel } from "@/lib/member/errorLabels";
import { eyebrowClasses, primaryButtonClasses } from "@/lib/styles";
import type { MemberProposalView } from "@/lib/matching/memberLifecycleTypes";
import PublicProfileCard from "./PublicProfileCard";

const secondaryButtonClasses =
  "inline-flex items-center justify-center rounded-full border border-ink px-9 py-4 text-[13px] font-medium uppercase tracking-[0.18em] text-ink transition-colors duration-200 hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

/**
 * A single proposal from the member's perspective — the product's core
 * promise made concrete: "we selected this person for you," never a
 * catalogue entry to browse past. Deliberately no swipe gesture, no card
 * stack, no "next" affordance — one selection, one decision, framed as a
 * considered introduction rather than a match queue.
 */
export default function ProposalCard({
  proposal,
  onDecided,
}: {
  proposal: MemberProposalView;
  onDecided: () => void;
}) {
  const [sending, setSending] = useState<"interested" | "passed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!proposal.candidate) {
    return (
      <div className="rounded-2xl border border-hairline bg-white p-6 text-center">
        <p className="text-[15px] text-ink-soft">Esta persona ya no está disponible.</p>
      </div>
    );
  }

  const name = proposal.candidate.firstName || "esta persona";

  async function decide(decision: "interested" | "passed") {
    setSending(decision);
    setError(null);
    try {
      const res = await memberFetch(`/api/member/proposals/${proposal.id}/decide`, {
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

  if (proposal.stage === "member_interested") {
    return (
      <div className="rounded-2xl border border-hairline bg-white p-6">
        <p className={eyebrowClasses}>Tu selección</p>
        <p className="mt-3 text-[16px] text-ink">
          Perfecto. Ahora le toca decidir a {name}.
        </p>
        <p className="mt-1 text-[14px] text-ink-soft">Te avisaremos si el interés es mutuo.</p>
      </div>
    );
  }

  if (proposal.stage !== "proposed" && proposal.stage !== "viewed") {
    // member_passed / mutual_interested / expired — nothing actionable
    // left to show here; ProposalsSection.tsx already filters these out
    // of the list it renders, this is only a defensive fallback.
    return null;
  }

  return (
    <div className="rounded-2xl border border-hairline bg-white p-6">
      <p className={eyebrowClasses}>Tu selección</p>
      <p className="mt-3 max-w-[46ch] text-[18px] leading-snug text-ink">
        Creemos que deberías conocer a {name}.
      </p>

      <div className="mt-6">
        <PublicProfileCard profile={proposal.candidate} />
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
