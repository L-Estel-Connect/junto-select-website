"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getOrCreateProfile, finalizeOnboarding } from "@/lib/introduction/profile";
import { getPrerequisiteRedirect } from "@/lib/introduction/completion";
import type { ProfileDocument } from "@/lib/introduction/types";
import { primaryButtonClasses } from "@/lib/styles";
import ProfileCard from "./ProfileCard";
import { IntroductionLoading } from "./RequireIntroductionAuth";

const linkClasses =
  "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

export default function ReviewSection({ uid }: { uid: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileDocument | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!profile) return;
    const redirect = getPrerequisiteRedirect(profile, "/introduction/review");
    if (redirect) router.replace(redirect);
  }, [profile, router]);

  if (!profile) {
    return <IntroductionLoading />;
  }

  if (getPrerequisiteRedirect(profile, "/introduction/review")) {
    return <IntroductionLoading />;
  }

  const finalized = profile.meta.onboardingFinalized;

  async function handleFinalize() {
    setError(null);
    setSaving(true);
    try {
      await finalizeOnboarding(uid);
      router.push("/introduction/home");
    } catch {
      setError("No hemos podido guardar tu perfil. Inténtalo de nuevo.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-6 py-14 sm:px-0">
      <Link href="/introduction/home" className={`text-sm ${linkClasses}`}>
        ← Volver a mi perfil
      </Link>

      <h1 className="mt-6 font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Así se verá tu perfil
      </h1>
      <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
        Revísalo antes de terminar. Podrás actualizar tu información más
        adelante.
      </p>

      <div className="mt-8">
        <ProfileCard profile={profile} />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-[#8a3b3b]">
          {error}
        </p>
      )}

      <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
        {finalized ? (
          <Link
            href="/introduction/home"
            className={`${primaryButtonClasses} text-center`}
          >
            Editar mi perfil
          </Link>
        ) : (
          <>
            <Link href="/introduction/home" className={`self-center text-sm ${linkClasses}`}>
              Editar
            </Link>
            <button
              type="button"
              disabled={saving}
              onClick={handleFinalize}
              className={primaryButtonClasses}
            >
              {saving ? "Guardando…" : "Guardar y finalizar"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
