"use client";

import { useState } from "react";
import Link from "next/link";
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
  const [decided, setDecided] = useState<"interested" | "passed" | null>(null);

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
      setSending(null);
      setDecided(decision);
      // "Pasar" has nothing further to act on, so it still auto-reloads
      // the lists after a beat — without that, a member had no
      // confirmation their response was even saved (see UX audit
      // "invitation response confirmation"). "Interested" now shows a
      // real "Ver conexión" CTA (mutual is guaranteed here — see the
      // comment above) and must stay on screen for the member to use it,
      // not get yanked out from under them by a background list reload.
      if (decision === "passed") setTimeout(onDecided, 1800);
    } catch (err) {
      setError(memberDecisionErrorLabel(err instanceof Error ? err.message : "request_failed"));
      setSending(null);
    }
  }

  if (decided === "interested") {
    // This card only ever exists because the inviter ALREADY said
    // Interested (that's what creates the invitation in the first place —
    // see recordMemberDecision) — so the candidate saying Interested here
    // always means both sides just said yes, i.e. always a mutual
    // introduction the instant this succeeds (decideInvitationForMember
    // returns ok:false/no_longer_compatible on the one case where a fresh
    // hard-filter recheck blocks it, so a successful "ok" here is never
    // just "waiting to see"). Telling the candidate "we'll let you know if
    // it's mutual" here would be false — it already is.
    return (
      <div className="rounded-2xl border border-hairline bg-white p-6">
        <p className={eyebrowClasses}>¡Es mutuo!</p>
        <p className="mt-3 text-[16px] text-ink">
          Los dos habéis mostrado interés. Ya podéis poneros en contacto. Encontrarás sus datos en
          Conexiones.
        </p>
        <Link href="/member/connections" className={`${primaryButtonClasses} mt-5 inline-flex`}>
          Ver conexión
        </Link>
      </div>
    );
  }

  if (decided === "passed") {
    return (
      <div className="rounded-2xl border border-hairline bg-white p-6">
        <p className={eyebrowClasses}>Respuesta registrada</p>
        <p className="mt-3 text-[16px] text-ink">Gracias. Hemos registrado tu respuesta.</p>
      </div>
    );
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
