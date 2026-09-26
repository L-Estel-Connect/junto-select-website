"use client";

import { useState } from "react";
import PublicPhotoThumbnail from "@/components/member/PublicPhotoThumbnail";
import ReconnectNeutralAvatarIcon from "./ReconnectNeutralAvatarIcon";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { primaryButtonClasses } from "@/lib/styles";
import type { PendingReconnectRequestView } from "@/lib/eventReconnect/types";

function formatDeadline(value: unknown): string {
  const ts = value as { toDate?: () => Date; _seconds?: number } | null | undefined;
  const date = ts?.toDate ? ts.toDate() : ts?._seconds ? new Date(ts._seconds * 1000) : null;
  if (!date) return "";
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * A small round avatar for the requester on an incoming request card — same
 * privacy rule as the discovery gallery's cards (see
 * PendingReconnectRequestView.otherPhotoPath's doc comment): never the raw
 * ProfileDocument photo when the requester hasn't activated, or activated
 * with their photo hidden. Reuses PublicPhotoThumbnail (the same
 * server-authorized photo route every other cross-member photo goes
 * through) rather than a new fetch path.
 */
function RequesterAvatar({ photoPath }: { photoPath: string | null }) {
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
      {photoPath ? (
        <PublicPhotoThumbnail path={photoPath} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-rose-tint">
          <ReconnectNeutralAvatarIcon className="h-6 w-6 text-rose-dark/50" />
        </div>
      )}
    </div>
  );
}

/**
 * Every Reconnect request still awaiting action for this event — the
 * "discovery closed but a pending request exists" state the product spec
 * calls for: never a reopened gallery/search, only the caller's own
 * pending item(s). A received request shows Accept/Decline; a sent one is
 * read-only status text — there is no cancel-a-sent-request action in V1
 * (see the report: a cancel path would need its own careful thought about
 * whether it refunds the allowance, which the product rule says it must
 * never do, so it's deliberately left out rather than half-built).
 */
export default function ReconnectPendingList({
  items,
  onDecided,
}: {
  items: PendingReconnectRequestView[];
  onDecided: () => void;
}) {
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, decision: "accept" | "decline") {
    setError(null);
    setDecidingId(id);
    try {
      await memberFetchJson(`/api/member/reconnect/requests/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      onDecided();
    } catch {
      setError("No hemos podido registrar tu respuesta. Inténtalo de nuevo.");
    } finally {
      setDecidingId(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-[13px] text-[#8a3b3b]">{error}</p>}
      {items.map((item) => (
        <div key={item.id} className="rounded-2xl border border-hairline bg-white p-5">
          {item.direction === "received" ? (
            <>
              <div className="flex items-center gap-3">
                <RequesterAvatar photoPath={item.otherPhotoPath} />
                <div>
                  <p className="text-[15px] text-ink">
                    <strong>{item.otherFirstName}</strong> quiere reconectar contigo.
                  </p>
                  <p className="mt-1 text-[13px] text-ink-soft">Responde antes del {formatDeadline(item.responseDeadline)}.</p>
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  disabled={decidingId === item.id}
                  onClick={() => decide(item.id, "accept")}
                  className={primaryButtonClasses}
                >
                  Aceptar
                </button>
                <button
                  type="button"
                  disabled={decidingId === item.id}
                  onClick={() => decide(item.id, "decline")}
                  className="rounded-full border border-hairline px-6 py-3 text-[13px] text-ink transition-colors hover:border-rose"
                >
                  Rechazar
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[15px] text-ink">
                Has enviado una solicitud a <strong>{item.otherFirstName}</strong>.
              </p>
              <p className="mt-1 text-[13px] text-ink-soft">Esperando respuesta hasta el {formatDeadline(item.responseDeadline)}.</p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
