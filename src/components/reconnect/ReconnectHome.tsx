"use client";

import { useState } from "react";
import Link from "next/link";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { useMemberQuery } from "@/lib/member/useMemberQuery";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import { IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { primaryButtonClasses } from "@/lib/styles";
import type { PendingReconnectRequestView, ReconnectStateView } from "@/lib/eventReconnect/types";
import ReconnectActivationForm from "./ReconnectActivationForm";
import ReconnectDiscovery from "./ReconnectDiscovery";
import ReconnectPendingList from "./ReconnectPendingList";

function NeutralMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[50svh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-serif text-[22px] font-normal leading-snug text-ink">{title}</p>
      <p className="max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}

/**
 * Orchestrates every state the product spec defines for the 48h discovery
 * window / 72h response window pair, in the order the spec lists them:
 * not a participant → not yet open / closed with nothing pending → open
 * (activation, or discovery once activated) → closed with a pending
 * request still actionable → fully resolved, with the Introduction CTA
 * only for an incomplete profile. Every transition is driven by re-fetching
 * `/state` and `/pending` from the server, never a client-side guess.
 */
export default function ReconnectHome({ uid, eventId }: { uid: string; eventId: string }) {
  const stateQuery = useMemberQuery(
    () => memberFetchJson<{ state: ReconnectStateView }>(`/api/member/reconnect/${eventId}/state`),
    [eventId],
  );
  const pendingQuery = useMemberQuery(
    () => memberFetchJson<{ results: PendingReconnectRequestView[] }>("/api/member/reconnect/pending"),
    [eventId],
  );
  const { profile } = useSharedProfile(uid);
  const [requestsRemaining, setRequestsRemaining] = useState<number | null>(null);

  // Adjusted during render (not in an effect) — seeds local state from the
  // server's first response exactly once, then locally controlled via
  // onRequestsRemainingChange as requests are sent (same pattern as
  // ContactSection.tsx's `prefs`).
  if (stateQuery.data && requestsRemaining === null) {
    setRequestsRemaining(stateQuery.data.state.requestsRemaining);
  }

  if (stateQuery.error) {
    return (
      <NeutralMessage
        title="No hemos encontrado este evento"
        body="Puede que el enlace no sea correcto, o que este evento ya no esté disponible."
      />
    );
  }
  if (!stateQuery.data) return <IntroductionLoading />;

  const { state } = stateQuery.data;

  if (!state.isParticipant) {
    return (
      <NeutralMessage
        title="No hemos encontrado tu registro para este evento"
        body="Comprueba que has iniciado sesión con el mismo email con el que compraste tu entrada."
      />
    );
  }

  const eventPending = pendingQuery.data?.results.filter((r) => r.eventId === eventId) ?? [];

  if (!state.isActivated) {
    if (state.windowState !== "open") {
      return (
        <NeutralMessage
          title="Reconnect no está disponible ahora mismo"
          body="El periodo de Reconnect para este evento no está abierto en este momento."
        />
      );
    }
    return (
      <ReconnectActivationForm
        uid={uid}
        eventId={eventId}
        onActivated={() => {
          stateQuery.reload();
          pendingQuery.reload();
        }}
      />
    );
  }

  if (state.windowState === "open") {
    return (
      <div className="flex flex-col gap-10">
        <div>
          <p className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
            Reconnect · {state.eventLabel}
          </p>
          <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
            ¿Conociste a alguien que te gustaría volver a ver?
          </p>
        </div>
        {eventPending.length > 0 && (
          <ReconnectPendingList
            items={eventPending}
            onDecided={() => {
              pendingQuery.reload();
              stateQuery.reload();
            }}
          />
        )}
        <ReconnectDiscovery
          eventId={eventId}
          requestsRemaining={requestsRemaining ?? 0}
          onRequestsRemainingChange={setRequestsRemaining}
        />
      </div>
    );
  }

  // Discovery has closed. Never reopen search/gallery here — only the
  // caller's own pending request(s), if any are still within their own
  // 72h response window (lazily expired server-side otherwise).
  if (eventPending.length > 0) {
    return (
      <div className="flex flex-col gap-6">
        <p className="font-serif text-[22px] font-normal leading-snug text-ink">Reconnect · {state.eventLabel}</p>
        <ReconnectPendingList
          items={eventPending}
          onDecided={() => {
            pendingQuery.reload();
            stateQuery.reload();
          }}
        />
      </div>
    );
  }

  const profileIncomplete = profile ? !profile.meta.onboardingFinalized : false;

  if (profileIncomplete) {
    return (
      <div className="flex min-h-[50svh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-serif text-[22px] font-normal leading-snug text-ink">
          ¿Quieres conocer a nuevas personas seleccionadas para ti?
        </p>
        <p className="max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
          Completa tu perfil para acceder a Introducciones privadas.
        </p>
        <Link href="/introduction" className={`${primaryButtonClasses} mt-2`}>
          Completar mi perfil
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50svh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-serif text-[22px] font-normal leading-snug text-ink">Reconnect ha terminado para este evento</p>
      <p className="max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
        Vuelve a tu cuenta de Junto Select para ver tus conexiones.
      </p>
      <Link href="/member" className={`${primaryButtonClasses} mt-2`}>
        Ir a mi cuenta
      </Link>
    </div>
  );
}
