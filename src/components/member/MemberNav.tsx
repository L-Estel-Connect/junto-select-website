"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import { signOutUser } from "@/lib/firebase/auth";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { useMemberQuery } from "@/lib/member/useMemberQuery";
import { useMemberUid } from "./MemberContext";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import { useBilling } from "@/lib/billing/useBilling";
import type { MemberLifecycleSummary } from "@/lib/matching/memberLifecycleTypes";
import { AUTOMATIC_INTRODUCTIONS_ENABLED } from "@/lib/matching/automaticIntroductions";

// "Ver mi perfil" and "Editar mi perfil" used to be two separate nav rows
// pointing at the same /member/profile route (the second just deep-linking
// to its lower #editar-perfil section) — collapsed into one entry here so
// the primary nav never shows two rows that open the same screen. The
// #editar-perfil anchor itself is unchanged and still used by direct
// in-page links elsewhere (MemberHome, ContactSection, SettingsSection).
// The private profile is the home page, so "Mi perfil" is /member and also
// covers the /member/profile/** edit pages.
const NAV_ITEMS = [
  { href: "/member", label: "Mi perfil" },
  { href: "/member/proposals", label: "Propuestas" },
  { href: "/member/connections", label: "Conexiones" },
  { href: "/member/plan", label: "Mi plan" },
  { href: "/member/settings", label: "Ajustes" },
];

/** A small filled dot — "something here needs your attention," never a count that could feel gamified. */
function AttentionDot() {
  return <span aria-hidden className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-dark align-middle" />;
}

function isActivePath(pathname: string, href: string): boolean {
  const base = href.split("#")[0];
  return base === "/member" ? pathname === "/member" || pathname.startsWith("/member/profile") : pathname.startsWith(base);
}

function HamburgerIcon() {
  return (
    <span className="flex w-5 flex-col items-stretch gap-[5px]">
      <span className="h-[1.5px] w-full bg-ink" />
      <span className="h-[1.5px] w-full bg-ink" />
      <span className="h-[1.5px] w-full bg-ink" />
    </span>
  );
}

export default function MemberNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const uid = useMemberUid();
  // Selecciones and Conexiones only exist once an introductions profile is
  // finished; a Select member without one uses the rest of the area.
  const { profile } = useSharedProfile(uid);
  // "Mi plan" is the dormant Membresía Select: shown only to accounts that
  // have (or had) a subscription. /member/plan itself still exists.
  const { billing } = useBilling(uid);
  const hasPlan = Boolean(billing && billing.status !== "none");
  const navItems = NAV_ITEMS.filter(
    (i) =>
      (i.href !== "/member/plan" || hasPlan) &&
      !(
        (!AUTOMATIC_INTRODUCTIONS_ENABLED || (profile && !profile.meta.onboardingFinalized)) &&
        (i.href === "/member/proposals" || i.href === "/member/connections")
      ),
  );
  // Nothing to count while automatic introductions are off.
  const summaryQuery = useMemberQuery(
    () =>
      AUTOMATIC_INTRODUCTIONS_ENABLED
        ? memberFetchJson<{ summary: MemberLifecycleSummary }>("/api/member/lifecycle-summary")
        : Promise.resolve({ summary: null as MemberLifecycleSummary | null }),
    [uid],
  );
  const summary = summaryQuery.data?.summary;
  const proposalsAttention =
    (summary?.proposalsWaitingForDecision ?? 0) + (summary?.invitationsWaitingForDecision ?? 0) > 0;
  const connectionsAttention = (summary?.mutualIntroductionsCount ?? 0) > 0;

  function attentionFor(href: string): boolean {
    if (href === "/member/proposals") return proposalsAttention;
    if (href === "/member/connections") return connectionsAttention;
    return false;
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <header className="border-b border-hairline bg-paper">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/member">
          <Wordmark className="text-sm text-ink" />
        </Link>

        <nav className="hidden items-center gap-5 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`whitespace-nowrap text-[11px] uppercase tracking-[0.1em] transition-colors ${
                isActivePath(pathname, item.href)
                  ? "text-ink"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {item.label}
              {attentionFor(item.href) && <AttentionDot />}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="whitespace-nowrap text-[11px] uppercase tracking-[0.1em] text-ink-soft transition-colors hover:text-ink"
          >
            Cerrar sesión
          </button>
        </nav>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center md:hidden"
        >
          <HamburgerIcon />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/30"
          />
          <div className="absolute right-0 top-0 flex h-full w-[82%] max-w-[320px] flex-col overflow-y-auto bg-paper px-6 py-6 shadow-xl">
            <div className="flex items-center justify-between">
              <Wordmark className="text-sm text-ink" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="flex h-9 w-9 items-center justify-center text-2xl leading-none text-ink-soft"
              >
                ×
              </button>
            </div>

            <nav className="mt-8 flex flex-col">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`border-b border-hairline py-4 text-[16px] ${
                    isActivePath(pathname, item.href) ? "text-ink" : "text-ink-soft"
                  }`}
                >
                  {item.label}
                  {attentionFor(item.href) && <AttentionDot />}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="border-b border-hairline py-4 text-left text-[16px] text-ink-soft"
              >
                Cerrar sesión
              </button>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
