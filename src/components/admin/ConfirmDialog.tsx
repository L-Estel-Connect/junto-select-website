"use client";

import { useState } from "react";

/**
 * Used for every irreversible-ish or member-facing-consequential admin
 * action (block a pair, confirm a duplicate merge) — spec §15 explicitly
 * asks for confirmation dialogs on sensitive actions.
 */
export default function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirmar",
  tone = "default",
  requireReason,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
  requireReason?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (requireReason && !reason.trim()) {
      setError("Este motivo es obligatorio.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "No se ha podido completar la acción.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
        <h3 className="font-serif text-[19px] text-ink">{title}</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{description}</p>

        {requireReason && (
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (obligatorio)"
            rows={3}
            className="mt-4 w-full rounded-lg border border-hairline px-3 py-2 text-[14px] text-ink placeholder:text-ink-soft/70 focus:border-rose-dark focus:outline-none"
          />
        )}

        {error && <p className="mt-3 text-[13px] text-[#8a3b3b]">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-full px-5 py-2.5 text-[13px] font-medium text-ink-soft hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className={`rounded-full px-5 py-2.5 text-[13px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              tone === "danger" ? "bg-[#8a3b3b] hover:bg-[#733030]" : "bg-ink hover:bg-ink/90"
            }`}
          >
            {pending ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
