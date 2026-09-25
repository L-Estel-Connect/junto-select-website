import type { Metadata } from "next";
import type { ReactNode } from "react";

// Same treatment as /introduction and /member: authenticated, ephemeral,
// event-scoped content that must never be indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ReconnectLayout({ children }: { children: ReactNode }) {
  return children;
}
