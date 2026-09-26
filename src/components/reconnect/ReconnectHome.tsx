"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/firebase/useAuth";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { useMemberQuery } from "@/lib/member/useMemberQuery";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import { IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { primaryButtonClasses } from "@/lib/styles";
import type { PendingReconnectRequestView, ReconnectStateView } from "@/lib/eventReconnect/types";
import ReconnectActivationForm from "./ReconnectActivationForm";
import ReconnectDiscovery from "./ReconnectDiscovery";
import ReconnectPendingList from "./ReconnectPendingList";
import ReconnectPhotoVisibilityToggle from "./ReconnectPhotoVisibilityToggle";

const linkClasses = "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

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
  const { user } = useAuth();
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
    // Deliberately explicit about the exact email checked, and that this
    // is a hard stop, not a temporary loading state — the only identity
    // check Reconnect ever performs is this one (the signed-in account's
    // own verified email against the event's imported attendee list), and
    // there is no other way in: no manual "which attendee am I" picker to
    // fall back to, since that would be spoofable.
    return (
      <NeutralMessage
        title="No hemos encontrado tu entrada para este evento"
        body={
          user?.email
            ? `No hay ninguna entrada importada para este evento asociada a ${user.email}. Si compraste tu entrada con otro email, inicia sesión con esa cuenta.`
            : "Comprueba que has iniciado sesión con el mismo email con el que compraste tu entrada."
        }
      />
    );
  }

  if (state.hasOptedOut) {
    return (
      <NeutralMessage
        title="Has decidido no participar en Reconnect"
        body="Tus datos de Reconnect para este evento han sido eliminados. Esto no afecta a tu cuenta de Junto Select."
      />
    );
  }

  const eventPending = pendingQuery.data?.results.filter((r) => r.eventId === eventId) ?? [];

  if (!state.isActivated) {
    // Discovery being closed normally blocks activation too — except when
    // this participant has a live incoming request whose own 72h response
    // deadline hasn't passed yet (see the audit's timing-window analysis:
    // a request received late in the 48h discovery window must not strand
    // its recipient). Neither window's duration changes here — this only
    // widens WHO can still reach the activation form, never search/gallery
    // or new-request-creation, which stay governed by windowState alone.
    if (state.windowState !== "open" && !state.hasPendingIncomingRequest) {
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
        onOptedOut={() => {
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
          <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
            Puedes conectar con hasta 3 personas que conociste durante la noche — ya sea por afinidad, amistad,
            interés profesional o porque simplemente te gustaría volver a verlas.
          </p>
          <Link href="/reconnect/connections" className={`mt-3 inline-block text-[13px] ${linkClasses}`}>
            Ver mis conexiones
          </Link>
        </div>
        <ReconnectPhotoVisibilityToggle
          eventId={eventId}
          show={state.showPhotoInReconnect}
          onChanged={() => stateQuery.reload()}
        />
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
        <div>
          <p className="font-serif text-[22px] font-normal leading-snug text-ink">Reconnect · {state.eventLabel}</p>
          <Link href="/reconnect/connections" className={`mt-2 inline-block text-[13px] ${linkClasses}`}>
            Ver mis conexiones
          </Link>
        </div>
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
    // Connection access (top) is deliberately never gated behind the soft
    // conversion CTA (bottom) — see the product rule: an accepted Reconnect
    // connection must never be held behind Private Introductions
    // onboarding. This link works identically here whether or not the
    // signed-in participant has any accepted connections yet (see
    // ReconnectConnectionsList's own empty state).
    return (
      <div className="flex min-h-[50svh] flex-col items-center justify-center gap-8 px-6 text-center">
        <Link href="/reconnect/connections" className={`text-[15px] ${linkClasses}`}>
          Ver mis conexiones
        </Link>
        <div className="flex flex-col items-center gap-4">
          <p className="font-serif text-[22px] font-normal leading-snug text-ink">
            ¿Quieres seguir conociendo gente más allá de este evento?
          </p>
          <p className="max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
            Completa tu perfil y descubre las Introducciones privadas de Junto Select.
          </p>
          <Link href="/introduction" className={`${primaryButtonClasses} mt-2`}>
            Completar mi perfil
          </Link>
        </div>
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
