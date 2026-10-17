"use client";

import type { ReactNode } from "react";

/** Small, shared building blocks for the Clientes pages. */

export const inputClasses =
  "w-full rounded-lg border border-hairline bg-white px-3 py-2 text-[14px] text-ink placeholder:text-ink-soft/70 focus:border-rose-dark focus:outline-none";

export const pillButton =
  "inline-flex items-center justify-center rounded-full border border-ink px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

export const primaryPill =
  "inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-40";

export const linkButton =
  "text-[13px] font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

export function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-hairline bg-white p-6">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-[20px] text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium uppercase tracking-[0.08em] text-ink-soft">{label}</span>
      <span className="mt-1.5 block">{children}</span>
      {hint && <span className="mt-1 block text-[12px] text-ink-soft">{hint}</span>}
    </label>
  );
}

/** A question from the candidate questionnaire, compact for the admin. */
export function Question({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-hairline/70 py-4 last:border-b-0 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
      <div>
        <p className="text-[14px] text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" }).format(d);
}

export function formatEuros(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

/** Human Spanish for the API's error codes. */
export function errorText(message: string | null): string | null {
  if (!message) return null;
  const code = message.split(":")[0];
  const known: Record<string, string> = {
    not_signed_in: "Tu sesión ha caducado. Vuelve a entrar.",
    unauthorized: "Tu sesión ha caducado. Vuelve a entrar.",
    not_found: "No se ha encontrado.",
    inquiry_not_found: "Esa solicitud ya no existe.",
    candidate_not_found: "Ese perfil ya no existe.",
    invalid_email: "El email no parece válido.",
    invalid_ageRange: "La edad mínima buscada es mayor que la máxima.",
    invalid_heightRange: "La altura mínima es mayor que la máxima.",
    invalid_ageYears: "La edad debe estar entre 18 y 99.",
  };
  return known[code] ?? (code.startsWith("invalid_") ? `Revisa el campo «${code.slice(8)}».` : "Algo ha fallado. Inténtalo de nuevo.");
}
