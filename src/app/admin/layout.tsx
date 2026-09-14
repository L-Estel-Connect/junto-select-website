import type { Metadata } from "next";
import type { ReactNode } from "react";

// The entire /admin/** tree — including /admin/login, which sits outside
// the (dashboard) route group's own auth-redirect layout — is private and
// never indexed, regardless of what the root layout's metadata says. See
// src/app/layout.tsx and README "SEO" for the public/private split.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
