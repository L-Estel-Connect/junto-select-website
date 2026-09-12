"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getNextOnboardingRoute,
  isPhotosComplete,
  isPreferencesComplete,
  isPresentationComplete,
} from "@/lib/introduction/completion";
import { getOrCreateProfile } from "@/lib/introduction/profile";
import type { ProfileDocument } from "@/lib/introduction/types";
import { signOutUser } from "@/lib/firebase/auth";
import { primaryButtonClasses } from "@/lib/styles";
import { IntroductionLoading } from "./RequireIntroductionAuth";

interface SectionInfo {
  label: string;
  complete: boolean;
  href: string | null;
}

export default function ProfileHome({ uid }: { uid: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrCreateProfile(uid).then((doc) => {
      if (!cancelled) setProfile(doc);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    if (profile && !profile.meta.aboutMeComplete) {
      router.replace("/introduction/onboarding");
    }
  }, [profile, router]);

  if (!profile || !profile.meta.aboutMeComplete) {
    return <IntroductionLoading />;
  }

  const finalized = profile.meta.onboardingFinalized;

  // The hub still lists every section, in the same order as the guided
  // flow, so someone can reopen and edit any of them at any time —
  // including after finalizing.
  const sections: SectionInfo[] = [
    { label: "Sobre ti", complete: true, href: null },
    {
      label: "Lo que buscas",
      complete: isPreferencesComplete(profile.dealbreakers),
      href: "/introduction/preferences",
    },
    {
      label: "Fotos",
      complete: isPhotosComplete(profile.photos),
      href: "/introduction/photos",
    },
    {
      label: "Tu presentación",
      complete: isPresentationComplete(profile.presentation.status),
      href: "/introduction/presentation",
    },
  ];

  const nextRoute = getNextOnboardingRoute(profile);
  const nextLabel =
    nextRoute === "/introduction/review"
      ? "Revisar y finalizar mi perfil"
      : "Completar mi perfil";

  return (
    <div className="mx-auto flex min-h-[75svh] w-full max-w-[560px] flex-col justify-center px-6 py-14 sm:px-0">
      <p className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Hola, {profile.visible.firstName || "de nuevo"}
      </p>

      {finalized ? (
        <>
          <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
            Tu perfil está listo. Ya formas parte de Junto Select. Cuando
            encontremos a alguien que encaje contigo, te avisaremos.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/introduction/review" className={primaryButtonClasses}>
              Ver mi perfil
            </Link>
            <a
              href="#secciones"
              className="self-center text-sm text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink"
            >
              Editar mi perfil
            </a>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
            Tu perfil está casi listo. Completa los últimos pasos para que
            podamos empezar a buscar personas compatibles para ti.
          </p>
          <Link
            href={nextRoute}
            className={`mt-8 self-start ${primaryButtonClasses}`}
          >
            {nextLabel}
          </Link>
        </>
      )}

      <div id="secciones" className="mt-10 border-t border-hairline">
        {sections.map((section) => (
          <SectionRow key={section.label} section={section} />
        ))}
      </div>

      <button
        type="button"
        onClick={() => signOutUser()}
        className="mt-12 self-start text-sm text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink"
      >
        Cerrar sesión
      </button>
    </div>
  );
}

function SectionRow({ section }: { section: SectionInfo }) {
  const content = (
    <div className="flex items-center justify-between border-b border-hairline py-5">
      <span className="text-[16px] text-ink">{section.label}</span>
      <span
        className={`text-[13px] ${section.complete ? "text-ink" : "text-ink-soft"}`}
      >
        {section.complete ? "Completado" : "Pendiente"}
      </span>
    </div>
  );

  if (section.href) {
    return (
      <Link href={section.href} className="block hover:opacity-70">
        {content}
      </Link>
    );
  }
  return content;
}
