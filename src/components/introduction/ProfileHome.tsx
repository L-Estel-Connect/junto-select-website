"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  computeProfileStatus,
  isPhotosComplete,
  isPreferencesComplete,
  isPresentationComplete,
} from "@/lib/introduction/completion";
import { getOrCreateProfile } from "@/lib/introduction/profile";
import type { ProfileDocument } from "@/lib/introduction/types";
import { signOutUser } from "@/lib/firebase/auth";
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

  const sections: SectionInfo[] = [
    { label: "Sobre ti", complete: true, href: null },
    {
      label: "Fotos",
      complete: isPhotosComplete(profile.photos),
      href: "/introduction/photos",
    },
    {
      label: "Lo que buscas",
      complete: isPreferencesComplete(profile.dealbreakers),
      href: "/introduction/preferences",
    },
    {
      label: "Tu presentación",
      complete: isPresentationComplete(profile.presentation.status),
      href: "/introduction/presentation",
    },
  ];

  // Eligibility (About me + Fotos + Lo que buscas) is what the status
  // message reflects — "Tu presentación" is intentionally not required,
  // so a profile can be genuinely done without it. Recomputed here
  // (rather than trusting the stored meta.profileStatus) so this always
  // matches the true underlying booleans even if some future write path
  // forgets to update the stored flag.
  const eligible = computeProfileStatus(profile) === "active_for_matching";
  const nextSection = sections.find((s) => !s.complete && s.href);
  const nextRequiredSection = sections.find(
    (s) => !s.complete && s.href && s.label !== "Tu presentación",
  );

  return (
    <div className="mx-auto flex min-h-[75svh] w-full max-w-[560px] flex-col justify-center px-6 py-14 sm:px-0">
      <p className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Hola, {profile.visible.firstName || "de nuevo"}
      </p>

      <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
        {eligible
          ? "Tu perfil está completo. Te avisaremos en cuanto tengamos una presentación seleccionada para ti."
          : "Tu perfil está casi listo. Completa los últimos pasos para que podamos empezar a buscar personas compatibles para ti."}
      </p>

      <div className="mt-10 border-t border-hairline">
        {sections.map((section) => (
          <SectionRow key={section.label} section={section} />
        ))}
      </div>

      {!eligible && nextRequiredSection?.href && (
        <Link
          href={nextRequiredSection.href}
          className="mt-10 inline-flex items-center justify-center rounded-full bg-rose px-9 py-4 text-center text-[13px] font-medium uppercase tracking-[0.18em] text-ink transition-colors duration-200 hover:bg-rose-dark"
        >
          Completar mi perfil
        </Link>
      )}

      {eligible && nextSection?.href && (
        <Link href={nextSection.href} className="mt-10 self-start text-sm text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink">
          Añadir tu presentación
        </Link>
      )}

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
