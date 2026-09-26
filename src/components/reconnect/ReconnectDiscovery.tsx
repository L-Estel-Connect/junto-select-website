"use client";

import { useState } from "react";
import PublicPhotoThumbnail from "@/components/member/PublicPhotoThumbnail";
import ReconnectNeutralAvatarIcon from "./ReconnectNeutralAvatarIcon";
import { memberFetchJson } from "@/lib/member/memberFetch";
import type { ReconnectCandidateView } from "@/lib/eventReconnect/types";

const inputClasses =
  "w-full rounded-md border border-hairline bg-paper px-4 py-3 text-[15px] text-ink placeholder:text-ink-soft/80 transition-colors focus:border-rose-dark focus:outline-none";

type Mode = "search" | "gallery";

/**
 * A tasteful, neutral placeholder for a photo that isn't shown — either
 * because this attendee hasn't activated Reconnect yet, or because they
 * activated and chose not to display a photo. Deliberately the same visual
 * treatment for both cases (no "sin foto" label, no generic user icon) so
 * an activated-but-photo-hidden participant never reads as incomplete or
 * suspicious — only the status line below the card tells the two apart.
 */
function NeutralAvatarPlaceholder() {
  return (
    <div className="flex aspect-[3/4] w-full items-center justify-center rounded-md bg-rose-tint">
      <ReconnectNeutralAvatarIcon className="h-10 w-10 text-rose-dark/50" />
    </div>
  );
}

/**
 * The button/status area below a candidate's name — always disabled once
 * `requestStatus` is anything but `"none"`, and always driven by that
 * server-derived field (see discovery.ts's resolveRequestStatus), never a
 * client-side "I clicked this" guess that would reset on reload. Wording
 * for `"closed"` (declined or expired) is deliberately neutral and
 * discreet — it never reveals which of the two actually happened, and
 * never invites a retry that would just no-op against the same doc anyway.
 */
function RequestButton({
  candidate,
  disabled,
  onRequest,
}: {
  candidate: ReconnectCandidateView;
  disabled: boolean;
  onRequest: () => void;
}) {
  if (candidate.isSelf) {
    return <span className="rounded-full border border-hairline px-4 py-2 text-center text-[13px] text-ink-soft">Tú</span>;
  }
  if (candidate.requestStatus === "accepted") {
    return (
      <button type="button" disabled className="rounded-full border border-hairline px-4 py-2 text-[13px] text-ink-soft">
        ✓ Conectados
      </button>
    );
  }
  if (candidate.requestStatus === "pending") {
    return (
      <button type="button" disabled className="rounded-full border border-hairline px-4 py-2 text-[13px] text-ink-soft">
        Solicitud enviada
      </button>
    );
  }
  if (candidate.requestStatus === "closed") {
    return (
      <button type="button" disabled className="rounded-full border border-hairline px-4 py-2 text-[13px] text-ink-soft">
        No disponible
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onRequest}
      className="rounded-full border border-hairline px-4 py-2 text-[13px] text-ink transition-colors hover:border-rose disabled:cursor-not-allowed disabled:opacity-60"
    >
      {candidate.activated ? "Solicitar conexión" : "Quiero volver a verle"}
    </button>
  );
}

function CandidateCard({
  candidate,
  disabled,
  onRequest,
}: {
  candidate: ReconnectCandidateView;
  disabled: boolean;
  onRequest: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="w-full overflow-hidden rounded-md">
        {candidate.photoPath ? <PublicPhotoThumbnail path={candidate.photoPath} /> : <NeutralAvatarPlaceholder />}
      </div>
      <p className="text-[15px] text-ink">{candidate.firstName}</p>
      {!candidate.activated && <p className="text-[12px] text-ink-soft">Aún no ha activado Reconnect</p>}
      {/* The caller's own card, shown deliberately (see discovery.ts's doc
          comment) so they see exactly what others see — same card, no
          separate "preview" UI. Only the action differs: never a request
          button on your own profile, both because it makes no sense and
          because createReconnectRequest independently refuses it
          server-side (cannot_request_self) regardless of what the UI does. */}
      <RequestButton candidate={candidate} disabled={disabled} onRequest={onRequest} />
    </div>
  );
}

/**
 * The two discovery methods the product spec requires — search by name
 * (primary) and the opt-in-only visual recall gallery (secondary, for "I
 * recognized her but don't know her name") — kept in one component since
 * they share the exact same candidate card, request flow, and remaining-
 * count display; only the fetch differs. Both only ever call server-side,
 * event-scoped, window-checked endpoints — no candidate data is ever
 * fetched or cached beyond what's currently on screen.
 */
export default function ReconnectDiscovery({
  eventId,
  requestsRemaining,
  onRequestsRemainingChange,
}: {
  eventId: string;
  requestsRemaining: number;
  onRequestsRemainingChange: (next: number) => void;
}) {
  const [mode, setMode] = useState<Mode>("search");
  const [nameQuery, setNameQuery] = useState("");
  const [results, setResults] = useState<ReconnectCandidateView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [galleryLoaded, setGalleryLoaded] = useState(false);

  async function runSearch(query: string) {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await memberFetchJson<{ results: ReconnectCandidateView[] }>(
        `/api/member/reconnect/${eventId}/search?name=${encodeURIComponent(query.trim())}`,
      );
      setResults(data.results);
    } catch {
      setError("No hemos podido buscar. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function loadGallery() {
    setLoading(true);
    setError(null);
    try {
      const data = await memberFetchJson<{ results: ReconnectCandidateView[] }>(
        `/api/member/reconnect/${eventId}/gallery`,
      );
      setResults(data.results);
      setGalleryLoaded(true);
    } catch {
      setError("No hemos podido cargar las fotos. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * On success, patches this one candidate's `requestStatus` to `"pending"`
   * directly in local state — a snappy optimistic update, not a fabricated
   * client-only flag: the server has just genuinely created that doc, so
   * the next reload (a fresh `/search` or `/gallery` call) will independently
   * re-derive the identical `"pending"` value from discovery.ts. On
   * `already_requested` (this candidate turned out to already have a live
   * request between them — a race, or a stale card), the correct fix is to
   * re-fetch rather than guess, so the server's real current status
   * (possibly `"accepted"` or `"closed"` by now) replaces whatever was
   * shown before.
   */
  async function handleRequest(participantId: string) {
    setError(null);
    try {
      const data = await memberFetchJson<{ requestsRemaining: number }>(
        `/api/member/reconnect/${eventId}/request`,
        { method: "POST", body: JSON.stringify({ targetParticipantId: participantId }) },
      );
      setResults((prev) => prev.map((c) => (c.participantId === participantId ? { ...c, requestStatus: "pending" } : c)));
      onRequestsRemainingChange(data.requestsRemaining);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "limit_reached") {
        setError("Ya has usado tus 3 solicitudes para este evento.");
      } else if (message === "already_requested") {
        if (mode === "search") void runSearch(nameQuery);
        else void loadGallery();
      } else {
        setError("No hemos podido enviar la solicitud. Inténtalo de nuevo.");
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("search")}
            className={`rounded-full border px-4 py-2 text-[13px] transition-colors ${
              mode === "search" ? "border-rose-dark bg-rose-tint text-ink" : "border-hairline text-ink-soft hover:border-rose"
            }`}
          >
            Buscar por nombre
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("gallery");
              if (!galleryLoaded) void loadGallery();
            }}
            className={`rounded-full border px-4 py-2 text-[13px] transition-colors ${
              mode === "gallery" ? "border-rose-dark bg-rose-tint text-ink" : "border-hairline text-ink-soft hover:border-rose"
            }`}
          >
            No recuerdo su nombre
          </button>
        </div>
        <p className="whitespace-nowrap text-[13px] text-ink-soft">
          {requestsRemaining} solicitud{requestsRemaining === 1 ? "" : "es"} disponible{requestsRemaining === 1 ? "" : "s"}
        </p>
      </div>

      {mode === "search" && (
        <input
          type="text"
          value={nameQuery}
          onChange={(e) => {
            setNameQuery(e.target.value);
            void runSearch(e.target.value);
          }}
          placeholder="Nombre de pila"
          className={inputClasses}
        />
      )}

      {mode === "gallery" && (
        <p className="text-[13px] text-ink-soft">Solo personas que también asistieron a este evento.</p>
      )}

      {loading && <p className="text-[14px] text-ink-soft">Cargando…</p>}
      {error && <p className="text-[13px] text-[#8a3b3b]">{error}</p>}

      {!loading && results.length === 0 && mode === "search" && nameQuery.trim() && (
        <p className="text-[14px] text-ink-soft">No hemos encontrado a nadie con ese nombre.</p>
      )}
      {!loading && results.length === 0 && mode === "gallery" && galleryLoaded && (
        <p className="text-[14px] text-ink-soft">Todavía no hay nadie más en este evento.</p>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {results.map((candidate) => (
            <CandidateCard
              key={candidate.participantId}
              candidate={candidate}
              disabled={requestsRemaining <= 0}
              onRequest={() => handleRequest(candidate.participantId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
