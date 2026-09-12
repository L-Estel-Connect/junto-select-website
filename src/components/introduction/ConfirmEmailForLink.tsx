"use client";

import { useState } from "react";
import { primaryButtonClasses } from "@/lib/styles";

const inputClasses =
  "w-full rounded-md border border-hairline bg-paper px-4 py-4 text-[15px] text-ink placeholder:text-ink-soft/80 transition-colors focus:border-rose-dark focus:outline-none";

export default function ConfirmEmailForLink({
  error,
  onConfirm,
}: {
  error: string | null;
  onConfirm: (email: string) => void;
}) {
  const [email, setEmail] = useState("");

  return (
    <div className="w-full space-y-3 text-left">
      <p className="text-center text-[15px] text-ink-soft">
        Confirma tu email para completar el acceso.
      </p>
      <input
        type="email"
        autoFocus
        value={email}
        placeholder="Tu email"
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && email.trim()) onConfirm(email.trim());
        }}
        className={inputClasses}
      />
      <button
        type="button"
        disabled={!email.trim()}
        onClick={() => onConfirm(email.trim())}
        className={`${primaryButtonClasses} w-full`}
      >
        Continuar
      </button>
      {error && (
        <p role="alert" className="text-center text-sm text-[#8a3b3b]">
          {error}
        </p>
      )}
    </div>
  );
}
