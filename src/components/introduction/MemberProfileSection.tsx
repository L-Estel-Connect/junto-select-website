"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { finalizeOnboarding } from "@/lib/introduction/profile";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import {
  getPrerequisiteRedirect,
  isPhotosComplete,
  isPreferencesComplete,
  isPresentationComplete,
} from "@/lib/introduction/completion";
import { primaryButtonClasses } from "@/lib/styles";
import ProfileCard from "./ProfileCard";
import { IntroductionError, IntroductionLoading } from "./RequireIntroductionAuth";

const linkClasses =
  "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

interface SectionInfo {
  label: string;
  complete: boolean;
  href: string | null;
}

export default function MemberProfileSection({ uid }: { uid: string }) {
  const router = useRouter();
  const { profile, error: profileError, refresh: refreshProfile, mutate } = useSharedProfile(uid);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const redirect = getPrerequisiteRedirect(profile, "/member/profile");
    if (redirect) router.replace(redirect);
  }, [profile, router]);

  if (!profile) {
    if (profileError) {
      return <IntroductionError message={profileError} onRetry={() => void refreshProfile()} />;
    }
    return <IntroductionLoading />;
  }

  if (getPrerequisiteRedirect(profile, "/member/profile")) {
    return <IntroductionLoading />;
  }

  const finalized = profile.meta.onboardingFinalized;

  async function handleFinalize() {
    setError(null);
    setSaving(true);
    try {
      await finalizeOnboarding(uid);
      mutate((prev) => ({ ...prev, meta: { ...prev.meta, onboardingFinalized: true } }));
    } catch {
      setError("No hemos podido guardar tu perfil. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const sections: SectionInfo[] = [
    { label: "Sobre ti", complete: true, href: "/member/profile/about" },
    {
      label: "Lo que buscas",
      complete: isPreferencesComplete(profile.dealbreakers),
      href: "/member/profile/preferences",
    },
    {
      label: "Fotos",
      complete: isPhotosComplete(profile.photos),
      href: "/member/profile/photos",
    },
    {
      label: "Tu presentación",
      complete: isPresentationComplete(profile.presentation.status),
      href: "/member/profile/presentation",
    },
    {
      label: "Contacto",
      complete: profile.contactPreferences.preferredMethod !== null,
      href: "/member/profile/contact",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-6 py-14 sm:px-0">
      <Link href="/member" className={`text-sm ${linkClasses}`}>
        ← Volver a mi perfil
      </Link>

      <h1 className="mt-6 font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        {finalized ? "Tu perfil" : "Así se verá tu perfil"}
      </h1>
      <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
        {finalized
          ? "Así te verán las personas con las que Junto Select te presente."
          : "Revísalo antes de terminar. Podrás actualizar tu información más adelante."}
      </p>

      <div className="mt-8">
        <ProfileCard profile={profile} />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-[#8a3b3b]">
          {error}
        </p>
      )}

      {!finalized && (
        <button
          type="button"
          disabled={saving}
          onClick={handleFinalize}
          className={`${primaryButtonClasses} mt-8 w-full`}
        >
          {saving ? "Guardando…" : "Guardar y finalizar"}
        </button>
      )}

      <div id="editar-perfil" className="mt-14 scroll-mt-10 border-t border-hairline pt-8">
        <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">
          Editar mi perfil
        </p>
        <div className="mt-4">
          {sections.map((section) => {
            const row = (
              <div className="flex items-center justify-between border-b border-hairline py-4">
                <span className="text-[15px] text-ink">{section.label}</span>
                <span
                  className={`text-[13px] ${section.complete ? "text-ink" : "text-ink-soft"}`}
                >
                  {section.complete ? "Completado" : "Pendiente"}
                </span>
              </div>
            );
            return section.href ? (
              <Link key={section.label} href={section.href} className="block hover:opacity-70">
                {row}
              </Link>
            ) : (
              <div key={section.label}>{row}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
