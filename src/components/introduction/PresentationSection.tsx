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
import { primaryButtonClasses, secondaryButtonClasses } from "@/lib/styles";
import { IntroductionError, IntroductionLoading } from "./RequireIntroductionAuth";
import { OnboardingStepper, inOnboarding } from "./OnboardingFrame";

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
  const { profile, error: profileError, refresh: refreshProfile, mutate } = useSharedProfile(uid);
  const [prompts, setPrompts] = useState<PresentationPrompts | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [reviewTextInitialized, setReviewTextInitialized] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

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

  if (!profile) {
    if (profileError) {
      return <IntroductionError message={profileError} onRetry={() => void refreshProfile()} />;
    }
    return <IntroductionLoading />;
  }

  if (!prompts) {
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
  const onboarding = inOnboarding(profile);
  const savedText = (profile.presentation.approvedText ?? profile.presentation.generatedText ?? "").trim();
  const unsavedEdit = reviewText.trim() !== savedText;

  const promptFields = (
    <div className="space-y-6">
      {PROMPT_QUESTIONS.map((p) => (
        <div key={p.id}>
          <label htmlFor={`prompt-${p.id}`} className="text-[16px] text-ink">
            {p.question}
          </label>
          <textarea
            id={`prompt-${p.id}`}
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
  );

  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col py-14">
      {onboarding ? (
        <OnboardingStepper
          stage={4}
          fraction={isApproved ? 1 : hasDraft ? 0.7 : 0.35}
          selectJourney={profile.meta.requestedService === "select"}
        />
      ) : (
        <Link href="/member/profile" className={`mb-6 text-sm ${linkClasses}`}>
          ← Volver a mi perfil
        </Link>
      )}

      <h1 className="font-serif text-[30px] font-normal leading-[1.15] text-ink sm:text-[40px]">
        Tu presentación
      </h1>
      <p className="mt-3 max-w-[50ch] text-[15px] leading-relaxed text-ink-soft">
        Con tus respuestas redactamos tu presentación. Tú la revisas antes de aprobarla.
      </p>
      <details className="mt-3 max-w-[50ch] text-[14px] text-ink-soft">
        <summary className="cursor-pointer underline decoration-hairline underline-offset-4 hover:text-ink">
          Cómo lo hacemos
        </summary>
        <p className="mt-2 leading-relaxed">
          Responde a estas preguntas y crearemos, con ayuda de inteligencia artificial, un texto elegante a
          partir de lo que nos cuentes. Nunca añadiremos nada que no nos hayas dicho tú, y siempre podrás
          revisarlo antes de aprobarlo.
        </p>
      </details>

      {hasDraft || isApproved ? (
        <details className="mt-8 border-y border-hairline py-4">
          <summary className="cursor-pointer text-[15px] text-ink">Tus respuestas</summary>
          <div className="mt-5">{promptFields}</div>
        </details>
      ) : (
        <div className="mt-8">{promptFields}</div>
      )}

      {!hasDraft && !isApproved && (
        <>
          <button
            type="button"
            disabled={!allPromptsFilled || generating}
            onClick={handleGenerate}
            className={`${primaryButtonClasses} mt-8 w-full`}
          >
            {generating ? "Generando…" : "Generar mi presentación"}
          </button>
          {!allPromptsFilled && !generating && (
            <p className="mt-2 text-center text-[13px] text-ink-soft">Responde a las tres preguntas para continuar.</p>
          )}
        </>
      )}

      {(hasDraft || isApproved) && (
        <div className="mt-10">
          <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-ink-soft">
            {isApproved ? "Tu presentación aprobada" : "Revisa tu presentación"}
          </p>
          {editing ? (
            <textarea
              aria-label="Tu presentación"
              rows={Math.max(7, Math.ceil(reviewText.length / 42))}
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              className={`mt-3 ${textareaClasses}`}
            />
          ) : (
            <div className="mt-3 rounded-md border border-hairline bg-white/60 px-5 py-5">
              <p className="whitespace-pre-line font-serif text-[18px] font-normal leading-relaxed text-ink">{reviewText}</p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {!editing && (
              <button type="button" onClick={() => setEditing(true)} className={linkClasses}>
                Editar el texto
              </button>
            )}
            <button type="button" disabled={generating || !allPromptsFilled} onClick={handleGenerate} className={linkClasses}>
              {generating ? "Generando…" : "Generar otra versión"}
            </button>
          </div>

          {!isApproved && (
            <button
              type="button"
              disabled={saving || !reviewText.trim()}
              onClick={async () => {
                await handleApprove();
                setEditing(false);
              }}
              className={`${primaryButtonClasses} mt-8 w-full`}
            >
              {saving ? "Guardando…" : "Aprobar"}
            </button>
          )}
          {isApproved && editing && (
            <button
              type="button"
              disabled={saving || !reviewText.trim() || !unsavedEdit}
              onClick={async () => {
                await handleApprove();
                setEditing(false);
              }}
              className={`${secondaryButtonClasses} mt-6`}
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          )}
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
          disabled={editing && unsavedEdit}
          onClick={() => router.push(getNextOnboardingRoute(profile))}
          className={`${primaryButtonClasses} mt-10 w-full`}
        >
          Continuar
        </button>
      )}
      {isApproved && editing && unsavedEdit && (
        <p className="mt-2 text-center text-[13px] text-ink-soft">Guarda tus cambios para continuar.</p>
      )}
    </div>
  );
}
