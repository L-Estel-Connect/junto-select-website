"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithGoogle } from "@/lib/firebase/auth";
import { auth } from "@/lib/firebase/client";
import { primaryButtonClasses } from "@/lib/styles";

/**
 * Deliberately Google-only (no magic-link option here, unlike the
 * member-facing /introduction sign-in) — this page is only ever used by
 * one person, and Google sign-in is already fully wired. Whatever account
 * signs in here, access is decided entirely server-side by
 * /api/admin/session against the ADMIN_ALLOWLIST_EMAILS allowlist — this
 * page has no opinion of its own about who is allowed in.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setPending(true);
    try {
      await signInWithGoogle();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("no_token");

      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        setError("No tienes acceso al panel de administración.");
        setPending(false);
        return;
      }

      router.replace("/admin");
    } catch (err) {
      setPending(false);
      const code = (err as { code?: string })?.code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        return;
      }
      setError("No hemos podido iniciar sesión. Inténtalo de nuevo.");
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-paper px-6">
      <div className="w-full max-w-sm rounded-2xl border border-hairline bg-white p-10 text-center shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-ink-soft">
          Junto Select
        </p>
        <h1 className="mt-3 font-serif text-[24px] font-normal text-ink">
          Panel de administración
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          Acceso restringido al equipo fundador.
        </p>

        <button
          type="button"
          disabled={pending}
          onClick={handleSignIn}
          className={`${primaryButtonClasses} mt-8 w-full`}
        >
          {pending ? "Conectando…" : "Iniciar sesión con Google"}
        </button>

        {error && (
          <p role="alert" className="mt-4 text-sm text-[#8a3b3b]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
