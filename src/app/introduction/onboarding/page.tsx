"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Section from "@/components/Section";
import OnboardingWizard from "@/components/introduction/OnboardingWizard";
import { useAuth } from "@/lib/firebase/useAuth";

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/introduction");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[70svh] items-center justify-center">
        <p className="text-sm text-ink-soft">Cargando…</p>
      </div>
    );
  }

  return (
    <Section as="main" size="sm">
      <OnboardingWizard uid={user.uid} />
    </Section>
  );
}
