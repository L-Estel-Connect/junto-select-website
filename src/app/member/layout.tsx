import type { Metadata } from "next";
import type { ReactNode } from "react";
import MemberShell from "@/components/member/MemberShell";
import { salonAppClassName } from "@/lib/salon/fonts";
import "../salon-app.css";

// The entire authenticated /member/** tree is private — never indexed,
// regardless of what the root layout's metadata says. See
// src/app/layout.tsx and README "SEO" for the public/private split.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function MemberLayout({ children }: { children: ReactNode }) {
  return (
    <div className={salonAppClassName}>
      <MemberShell>{children}</MemberShell>
    </div>
  );
}
