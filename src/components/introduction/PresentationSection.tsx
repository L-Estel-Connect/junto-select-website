"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import {
  approvePresentation,
  savePresentationPrompts,
} from "@/lib/introduction/presentation";
import { getNextOnboardingRoute, getPrerequisiteRedirect } from "@/lib/introduction/completion";
import type { PresentationPrompts } from "@/lib/introduction/types";
import { primaryButtonClasses } from "@/lib/styles";
import { IntroductionLoading } from "./RequireIntroductionAuth";

const textareaClasses =
  "w-full rounded-md border border-hairline bg-paper px-4 py-3 text-[15px] leading-relaxed text-ink placeholder:text-ink-soft/80 transition-colors focus:border-rose-dark focus:outline-none";

const linkClasses =
  "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

const PROMPT_QUESTIONS: { id: keyof PresentationPrompts; question: string }[] = [
  {
    id: "freeTime",
    question: "¿Qué te apasiona o cómo sueles pasar tu tiempo libre?",
  },
  {
    id: "values",
    question: "¿Qué es lo más importante para ti en una relación seria?",
  },
  {
    id: "aboutYou",
    question: "Algo que la gente suele decir sobre ti.",
  },
];

const MAX_PROMPT_LENGTH = 300;

export default function PresentationSection({ uid }: { uid: string }) {
  const router = useRouter();
  const { profile, mutate } = useSharedProfile(uid);
  const [prompts, setPrompts] = useState<PresentationPrompts | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [reviewTextInitialized, setReviewTextInitialized] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adjusted during render (not in an effect) — initializes local state
  // from the loaded profile exactly once. `prompts` is then autosaved
  // locally, and `reviewText` becomes the person's own edit buffer,
  // neither of which should reset just because `profile` changes
  // reference elsewhere. See OnboardingWizard.tsx for why this pattern is
  // safe and doesn't loop.
  if (profile && prompts === null) {
    setPrompts(profile.presentation.prompts);
  }
  if (profile && !reviewTextInitialized) {
    setReviewText(profile.presentation.approvedText ?? profile.presentation.generatedText ?? "");
    setReviewTextInitialized(true);
  }

  useEffect(() => {
    if (!profile) return;
    const redirect = getPrerequisiteRedirect(profile, "/member/profile/presentation");
    if (redirect) router.replace(redirect);
  }, [profile, router]);

  if (!profile || !prompts) {
    return <IntroductionLoading />;
  }

  if (getPrerequisiteRedirect(profile, "/member/profile/presentation")) {
    return <IntroductionLoading />;
  }

  const allPromptsFilled = PROMPT_QUESTIONS.every((p) => prompts[p.id].trim());
  const hasDraft = Boolean(profile.presentation.generatedText || profile.presentation.approvedText);

  function handlePromptChange(id: keyof PresentationPrompts, value: string) {
    setPrompts((prev) => (prev ? { ...prev, [id]: value } : prev));
  }

  async function handlePromptBlur() {
    if (!prompts) return;
    await savePresentationPrompts(uid, prompts);
  }

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("no_auth");
      const response = await fetch("/api/introduction/generate-presentation", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = (await response.json()) as { ok: boolean; text?: string };
      if (!response.ok || !data.ok || !data.text) {
        throw new Error("generation_failed");
      }
      setReviewText(data.text);
      mutate((prev) => ({
        ...prev,
        presentation: { ...prev.presentation, generatedText: data.text!, status: "draft" },
      }));
    } catch {
      setError(
        "No hemos podido generar tu presentación ahora mismo. Inténtalo de nuevo en unos minutos.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove() {
    if (!profile || !reviewText.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await approvePresentation(uid, reviewText.trim(), profile);
      mutate((prev) => ({
        ...prev,
        presentation: { ...prev.presentation, approvedText: reviewText.trim(), status: "approved" },
      }));
    } catch {
      setError("No hemos podido guardar tu presentación. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const isApproved = profile.presentation.status === "approved";

  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col px-6 py-14 sm:px-0">
      <Link href="/member" className={`text-sm ${linkClasses}`}>
        ← Volver a mi perfil
      </Link>

      <h1 className="mt-6 font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Tu presentación
      </h1>
      <p className="mt-2 max-w-[50ch] text-[15px] leading-relaxed text-ink-soft">
        Responde a estas preguntas y crearemos, con ayuda de inteligencia
        artificial, un texto elegante a partir de lo que nos cuentes. Nunca
        añadiremos nada que no nos hayas dicho tú, y siempre podrás revisarlo
        antes de aprobarlo.
      </p>

      <div className="mt-8 space-y-6">
        {PROMPT_QUESTIONS.map((p) => (
          <div key={p.id}>
            <p className="text-[15px] text-ink">{p.question}</p>
            <textarea
              rows={3}
              maxLength={MAX_PROMPT_LENGTH}
              value={prompts[p.id]}
              onChange={(e) => handlePromptChange(p.id, e.target.value)}
              onBlur={handlePromptBlur}
              className={`mt-2 ${textareaClasses}`}
            />
          </div>
        ))}
      </div>

      {!isApproved && (
        <button
          type="button"
          disabled={!allPromptsFilled || generating}
          onClick={handleGenerate}
          className={`${primaryButtonClasses} mt-8 w-full`}
        >
          {generating
            ? "Generando…"
            : hasDraft
              ? "Generar de nuevo"
              : "Generar mi presentación"}
        </button>
      )}

      {(hasDraft || isApproved) && (
        <div className="mt-10 border-t border-hairline pt-8">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">
            {isApproved ? "Tu presentación aprobada" : "Revisa tu presentación"}
          </p>
          <textarea
            rows={7}
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            className={`mt-3 ${textareaClasses}`}
          />
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={saving || !reviewText.trim()}
              onClick={handleApprove}
              className={primaryButtonClasses}
            >
              {saving ? "Guardando…" : isApproved ? "Guardar cambios" : "Aprobar"}
            </button>
            {isApproved && (
              <button
                type="button"
                disabled={generating}
                onClick={handleGenerate}
                className={`text-sm ${linkClasses}`}
              >
                Generar de nuevo con IA
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-[#8a3b3b]">
          {error}
        </p>
      )}

      {isApproved && (
        <button
          type="button"
          onClick={() => router.push(getNextOnboardingRoute(profile))}
          className={`${primaryButtonClasses} mt-10 w-full`}
        >
          Continuar
        </button>
      )}
    </div>
  );
}
