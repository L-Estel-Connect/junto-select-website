"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Section from "@/components/Section";
import Wordmark from "@/components/Wordmark";
import AuthButtons from "@/components/introduction/AuthButtons";
import { useAuth } from "@/lib/firebase/useAuth";
import { eyebrowClasses } from "@/lib/styles";

export default function IntroductionLandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/introduction/onboarding");
    }
  }, [loading, user, router]);

  if (loading || user) {
    return (
      <div className="flex min-h-[70svh] items-center justify-center">
        <p className="text-sm text-ink-soft">Cargando…</p>
      </div>
    );
  }

  return (
    <Section
      as="main"
      size="sm"
      className="flex min-h-[80svh] flex-col items-center justify-center gap-8 py-16 text-center"
    >
      <div className="space-y-1">
        <p className={eyebrowClasses}>Junto Select</p>
      </div>

      <Wordmark className="text-2xl text-ink sm:text-3xl" />

      <h1 className="max-w-[24ch] font-serif text-[28px] font-normal leading-snug text-ink sm:text-3xl">
        No busques. Deja que te encontremos a alguien.
      </h1>

      <p className="max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
        Junto Select Introduction es un servicio privado de presentaciones
        seleccionadas. Crea tu perfil en unos minutos.
      </p>

      <div className="w-full max-w-[360px]">
        <AuthButtons />
      </div>

      <p className="max-w-[38ch] text-xs leading-relaxed text-ink-soft">
        Al continuar, aceptas que Junto Select guarde tu información de
        forma privada para poder ofrecerte presentaciones seleccionadas.
      </p>
    </Section>
  );
}
