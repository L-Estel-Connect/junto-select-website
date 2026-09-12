"use client";

import { useState } from "react";
import { sendMagicLink, signInWithGoogle } from "@/lib/firebase/auth";
import { primaryButtonClasses } from "@/lib/styles";

const buttonBaseClasses =
  "flex w-full items-center justify-center gap-3 rounded-full border border-hairline bg-white px-6 py-4 text-[15px] font-medium text-ink transition-colors hover:border-rose disabled:cursor-not-allowed disabled:opacity-60";

const inputClasses =
  "w-full rounded-md border border-hairline bg-paper px-4 py-4 text-[15px] text-ink placeholder:text-ink-soft/80 transition-colors focus:border-rose-dark focus:outline-none";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type View = "options" | "email-form" | "email-sent";

export default function AuthButtons() {
  const [view, setView] = useState<View>("options");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setError(null);
    setPending(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      setPending(false);
      // Closing the popup or opening a second one isn't a real failure —
      // don't scare the person with an error for a deliberate action.
      const code = (error as { code?: string })?.code;
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        return;
      }
      setError(
        "No hemos podido iniciar sesión. Inténtalo de nuevo en unos minutos.",
      );
    }
  }

  async function handleSendLink() {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Introduce un email válido.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await sendMagicLink(trimmed);
      setView("email-sent");
    } catch {
      setError(
        "No hemos podido enviar el enlace. Inténtalo de nuevo en unos minutos.",
      );
    } finally {
      setPending(false);
    }
  }

  if (view === "email-sent") {
    return (
      <div className="w-full text-center">
        <p className="text-[15px] text-ink">
          Te hemos enviado un enlace a <strong>{email}</strong>.
        </p>
        <p className="mt-2 text-[15px] text-ink-soft">
          Ábrelo desde este mismo dispositivo para continuar.
        </p>
      </div>
    );
  }

  if (view === "email-form") {
    return (
      <div className="w-full space-y-3">
        <input
          type="email"
          autoFocus
          value={email}
          placeholder="Tu email"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSendLink();
          }}
          className={inputClasses}
        />
        <button
          type="button"
          disabled={pending}
          onClick={handleSendLink}
          className={`${primaryButtonClasses} w-full`}
        >
          {pending ? "Enviando…" : "Enviar enlace"}
        </button>
        <button
          type="button"
          onClick={() => {
            setView("options");
            setError(null);
          }}
          className="w-full text-center text-sm text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink"
        >
          Atrás
        </button>
        {error && (
          <p role="alert" className="text-center text-sm text-[#8a3b3b]">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={handleGoogle}
        className={buttonBaseClasses}
      >
        <GoogleMark />
        {pending ? "Conectando…" : "Continuar con Google"}
      </button>

      <button
        type="button"
        onClick={() => {
          setError(null);
          setView("email-form");
        }}
        className={buttonBaseClasses}
      >
        Continuar con email
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
