"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/useAuth";
import { signOutUser } from "@/lib/firebase/auth";
import { refreshAdminSessionCookie } from "@/lib/admin/adminFetch";

const NAV_ITEMS = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/members", label: "Miembros" },
  { href: "/admin/matching", label: "Matching" },
  { href: "/admin/proposals", label: "Propuestas" },
  { href: "/admin/introductions", label: "Introducciones" },
  { href: "/admin/review", label: "Revisión" },
];

const REFRESH_INTERVAL_MS = 45 * 60 * 1000;

export default function AdminShell({
  children,
  adminEmail,
}: {
  children: ReactNode;
  adminEmail: string;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // The server-side layout already verified the page-load cookie before
  // rendering this at all — this effect is a client-side convenience for
  // the rest of the session, not the security boundary. If the Firebase
  // client's own auth state ever disagrees (e.g. signed out in another
  // tab), send them back to login rather than showing a dashboard that
  // every subsequent API call would refuse anyway.
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/admin/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    refreshAdminSessionCookie().catch(() => {});
    const interval = setInterval(() => {
      refreshAdminSessionCookie().catch(() => {});
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user]);

  async function handleSignOut() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => {});
    await signOutUser().catch(() => {});
    router.replace("/admin/login");
  }

  return (
    <div className="flex min-h-svh bg-paper">
      <aside className="flex w-60 shrink-0 flex-col border-r border-hairline bg-white px-5 py-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-ink-soft">
          Junto Select
        </p>
        <p className="mt-1 text-[15px] font-medium text-ink">Panel de administración</p>

        <nav className="mt-10 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors ${
                  active ? "bg-rose-tint text-ink" : "text-ink-soft hover:bg-rose-tint/60 hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-8">
          <p className="truncate text-[12px] text-ink-soft" title={adminEmail}>
            {adminEmail}
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-2 text-[13px] font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-x-auto px-10 py-10">{children}</main>
    </div>
  );
}
