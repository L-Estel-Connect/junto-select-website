import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireAdminFromCookie } from "@/lib/admin/session";
import AdminShell from "@/components/admin/AdminShell";

/**
 * Server Component — runs before any child route renders. If there's no
 * valid admin cookie (never signed in, expired, revoked, or the allowlist
 * changed since), this redirects to /admin/login without ever constructing
 * the dashboard tree below, so no dashboard markup — and therefore no
 * dashboard data — reaches an unauthorized request. See
 * src/lib/admin/session.ts for what "valid" means here.
 */
export default async function AdminDashboardLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminFromCookie().catch(() => null);
  if (!admin) redirect("/admin/login");

  return <AdminShell adminEmail={admin.email}>{children}</AdminShell>;
}
