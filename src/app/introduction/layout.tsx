import type { Metadata } from "next";
import type { ReactNode } from "react";

// The sign-in/onboarding tree is authenticated-user-only content (or a
// pre-auth landing page with nothing to index) — never indexed,
// regardless of what the root layout's metadata says. See
// src/app/layout.tsx and README "SEO" for the public/private split.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function IntroductionLayout({ children }: { children: ReactNode }) {
  return children;
}
