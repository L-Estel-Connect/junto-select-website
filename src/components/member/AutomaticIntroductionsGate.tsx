"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AUTOMATIC_INTRODUCTIONS_ENABLED } from "@/lib/matching/automaticIntroductions";
import { IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";

/**
 * Propuestas and Conexiones belong to the switched-off automatic
 * introductions (see automaticIntroductions.ts): their pages send the
 * candidate back to their private profile instead. The pages and their
 * history are kept for when the switch is turned back on.
 */
export default function AutomaticIntroductionsGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    if (!AUTOMATIC_INTRODUCTIONS_ENABLED) router.replace("/member");
  }, [router]);
  if (!AUTOMATIC_INTRODUCTIONS_ENABLED) return <IntroductionLoading />;
  return <>{children}</>;
}
