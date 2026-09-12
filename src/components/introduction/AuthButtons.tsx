"use client";

import { useState } from "react";
import { signInWithApple, signInWithGoogle } from "@/lib/firebase/auth";

const buttonBaseClasses =
  "flex w-full items-center justify-center gap-3 rounded-full border border-hairline bg-white px-6 py-4 text-[15px] font-medium text-ink transition-colors hover:border-rose disabled:cursor-not-allowed disabled:opacity-60";

export default function AuthButtons() {
  const [pending, setPending] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(provider: "google" | "apple") {
    setError(null);
    setPending(provider);
    try {
      await (provider === "google" ? signInWithGoogle() : signInWithApple());
      // signInWithRedirect navigates away; nothing else to do here.
    } catch {
      setPending(null);
      setError(
        "No hemos podido iniciar sesión. Inténtalo de nuevo en unos minutos.",
      );
    }
  }

  return (
    <div className="w-full space-y-3">
      <button
        type="button"
        disabled={pending !== null}
        onClick={() => handle("google")}
        className={buttonBaseClasses}
      >
        <GoogleMark />
        {pending === "google" ? "Conectando…" : "Continuar con Google"}
      </button>

      <button
        type="button"
        disabled={pending !== null}
        onClick={() => handle("apple")}
        className={buttonBaseClasses}
      >
        <AppleMark />
        {pending === "apple" ? "Conectando…" : "Continuar con Apple"}
      </button>

      {error && (
        <p role="alert" className="text-center text-sm text-[#8a3b3b]">
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg
      width="16"
      height="18"
      viewBox="0 0 16 18"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M13.1 9.5c0-2 1.6-2.9 1.7-3-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.3 2-1.4 2.4-.4 6 1 8 .7 1 1.5 2.1 2.6 2 1-.1 1.4-.6 2.7-.6 1.2 0 1.6.6 2.7.6 1.1 0 1.9-1 2.6-2 .8-1.2 1.1-2.3 1.2-2.4-.1 0-2.6-1-2.7-3z" />
      <path d="M10.9 3.3c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.6 1 .1 1.9-.5 2.5-1.2z" />
    </svg>
  );
}
