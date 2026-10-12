"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV, SIGN_IN_HREF, joinHref } from "@/lib/site/content";

/** `overlay`: transparent header over a full-bleed photo; `solid`: plain pages. */
export default function SiteHeader({ variant = "overlay" }: { variant?: "overlay" | "solid" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={`hdr${variant === "solid" ? " solid" : ""}`}>
      <div className="wrap">
        <Link className="word" href="/">
          Junto <span>Select</span>
        </Link>
        <nav className="nav" aria-label="Principal">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hdr-actions">
          <Link className="acc" href={SIGN_IN_HREF}>
            Acceder
          </Link>
          <Link className="btn btn-laton" href={joinHref()}>
            Únete al club
          </Link>
          <button
            className="burger"
            type="button"
            aria-label="Abrir menú"
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen(true)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>

      {open && (
        <div className="menu" id="site-menu" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="menu-top">
            <Link className="word" href="/" onClick={() => setOpen(false)}>
              Junto <span>Select</span>
            </Link>
            <button type="button" onClick={() => setOpen(false)}>
              Cerrar
            </button>
          </div>
          <nav aria-label="Menú móvil">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="sec">
            <Link href={SIGN_IN_HREF} onClick={() => setOpen(false)}>
              Acceder
            </Link>
          </div>
          <Link className="btn btn-tinta" href={joinHref()} onClick={() => setOpen(false)}>
            Únete al club
          </Link>
        </div>
      )}
    </header>
  );
}
