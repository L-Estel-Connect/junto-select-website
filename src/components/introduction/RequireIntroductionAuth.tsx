"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/useAuth";

export function IntroductionLoading() {
  return (
    <div className="flex min-h-[70svh] items-center justify-center">
      <p className="text-sm text-ink-soft">Cargando…</p>
    </div>
  );
}

/**
 * Shared guard for every page under /introduction that requires a signed-in
 * user (onboarding, Profile Home, Fotos, Lo que buscas, Tu presentación).
 * Redirects to /introduction when there's definitively no user, and shows
 * a loading state in between — never the signed-out screen — while that's
 * still being determined.
 */
export default function RequireIntroductionAuth({
  children,
}: {
  children: (uid: string) => React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/introduction");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return <IntroductionLoading />;
  }

  return <>{children(user.uid)}</>;
}
