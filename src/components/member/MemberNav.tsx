"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import { signOutUser } from "@/lib/firebase/auth";

const NAV_ITEMS = [
  { href: "/member", label: "Inicio" },
  { href: "/member/profile", label: "Ver mi perfil" },
  { href: "/member/profile#editar-perfil", label: "Editar mi perfil" },
  { href: "/member/proposals", label: "Mis propuestas" },
  { href: "/member/connections", label: "Conexiones" },
  { href: "/member/plan", label: "Mi plan" },
  { href: "/member/settings", label: "Ajustes" },
];

const SECONDARY_ITEMS = [
  { href: "/privacidad", label: "Privacidad" },
  { href: "/terminos", label: "Términos de uso" },
];

function isActivePath(pathname: string, href: string): boolean {
  const base = href.split("#")[0];
  return base === "/member" ? pathname === "/member" : pathname.startsWith(base);
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
          {NAV_ITEMS.map((item) => (
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
            </Link>
          ))}
          <button
            type="button"
            onClick={() => signOutUser()}
            className="whitespace-nowrap text-[11px] uppercase tracking-[0.1em] text-ink-soft hover:text-ink"
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
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`border-b border-hairline py-4 text-[16px] ${
                    isActivePath(pathname, item.href) ? "text-ink" : "text-ink-soft"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-6 flex flex-col gap-1">
              {SECONDARY_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="py-2 text-[13px] text-ink-soft"
                >
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  signOutUser();
                }}
                className="py-2 text-left text-[13px] text-ink-soft"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
