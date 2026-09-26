"use client";

import { useState } from "react";
import { memberFetchJson } from "@/lib/member/memberFetch";

/**
 * The editable "Mostrar mi foto en Reconnect" ON/OFF preference — visible
 * only once activated (only ever mounted from ReconnectHome's
 * activated+open branch). Takes its current value as a prop (from
 * ReconnectHome's own `/state` fetch — see ReconnectStateView.
 * showPhotoInReconnect) rather than fetching it independently, so the page
 * makes exactly one `/state` call. Flips optimistically is deliberately
 * NOT done here — `onChanged` re-fetches `/state` after a successful POST,
 * so the toggle always reflects the server's actual, just-confirmed value.
 */
export default function ReconnectPhotoVisibilityToggle({
  eventId,
  show,
  onChanged,
}: {
  eventId: string;
  show: boolean;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    setError(null);
    setPending(true);
    try {
      await memberFetchJson(`/api/member/reconnect/${eventId}/photo-visibility`, {
        method: "POST",
        body: JSON.stringify({ show: !show }),
      });
      onChanged();
    } catch {
      setError("No hemos podido actualizar tu preferencia. Inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-hairline bg-white px-5 py-4">
      <div>
        <p className="text-[14px] text-ink">Mostrar mi foto en Reconnect</p>
        <p className="mt-0.5 text-[12px] text-ink-soft">No afecta a tu foto en Introducciones privadas.</p>
        {error && <p className="mt-1 text-[12px] text-[#8a3b3b]">{error}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={show}
        disabled={pending}
        onClick={handleToggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
          show ? "bg-rose-dark" : "bg-hairline"
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
            show ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
