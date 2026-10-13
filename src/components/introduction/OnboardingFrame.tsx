"use client";

import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import type { ProfileDocument } from "@/lib/introduction/types";

/**
 * The five stages of the Introducciones profile, in the order the existing
 * flow already visits them (see getNextOnboardingRoute). Display only: the
 * stepper never decides where anyone goes.
 */
export type OnboardingStage = 1 | 2 | 3 | 4 | 5;

const STAGE_LABELS: Record<OnboardingStage, string> = {
  1: "Sobre ti",
  2: "Lo que buscas",
  3: "Fotos",
  4: "Tu presentación",
  5: "Revisar",
};

/** Previous stage a person may reopen. Stage 1 → 2 has no way back (the questionnaire moves on once complete). */
const PREVIOUS_STAGE_HREF: Partial<Record<OnboardingStage, string>> = {
  3: "/member/profile/preferences",
  4: "/member/profile/photos",
  5: "/member/profile/presentation",
};

export function stageLabel(stage: OnboardingStage, selectJourney: boolean): string {
  return stage === 5 && selectJourney ? "Revisar y elegir plan" : STAGE_LABELS[stage];
}

/** Whether the focused onboarding frame applies (profile not yet confirmed). */
export function inOnboarding(profile: Pick<ProfileDocument, "meta"> | null | undefined): boolean {
  return !!profile && !profile.meta.onboardingFinalized;
}

/**
 * Slim header used while a profile is being completed: the wordmark, a
 * reassurance that answers are saved, and a way out. The member menu only
 * appears once the profile is confirmed.
 */
export function OnboardingHeader() {
  return (
    <header className="border-b border-hairline bg-paper">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <Wordmark className="text-[13px] text-ink" />
        <div className="flex items-center gap-5 text-[13px] text-ink-soft">
          <span className="hidden sm:inline">Se guarda automáticamente</span>
          <Link href="/" className="underline decoration-hairline underline-offset-4 hover:text-ink">
            Guardar y salir
          </Link>
        </div>
      </div>
    </header>
  );
}

/**
 * Five-part progress shown at the top of every stage. `fraction` fills the
 * current stage (e.g. question 4 of 16). `detail` is shown after the stage
 * name; `onBack` (or the previous stage's page) gives an "Atrás" link.
 */
export function OnboardingStepper({
  stage,
  fraction = 0,
  detail,
  selectJourney,
  onBack,
}: {
  stage: OnboardingStage;
  fraction?: number;
  detail?: string;
  selectJourney: boolean;
  onBack?: () => void;
}) {
  const backHref = PREVIOUS_STAGE_HREF[stage];
  const stages: OnboardingStage[] = [1, 2, 3, 4, 5];
  return (
    <div className="mb-10 sm:mb-12" data-testid="onboarding-stepper">
      <ol
        className="grid grid-cols-5 gap-1.5"
        aria-label={`Paso ${stage} de 5: ${stageLabel(stage, selectJourney)}`}
      >
        {stages.map((s) => {
          const fill = s < stage ? 1 : s === stage ? Math.min(Math.max(fraction, 0.06), 1) : 0;
          return (
            <li key={s} className="h-[3px] overflow-hidden rounded-full bg-hairline" title={stageLabel(s, selectJourney)}>
              <span
                className="block h-full rounded-full bg-[var(--laton,#a8875a)] transition-[width] duration-300"
                style={{ width: `${fill * 100}%` }}
              />
              <span className="sr-only">{stageLabel(s, selectJourney)}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex items-baseline justify-between gap-4 text-[13px] text-ink-soft">
        <p>
          <span className="text-ink">{stageLabel(stage, selectJourney)}</span>
          <span className="mx-2 text-hairline" aria-hidden>·</span>
          {detail ?? `Paso ${stage} de 5`}
        </p>
        {onBack ? (
          <button type="button" onClick={onBack} className="shrink-0 underline decoration-hairline underline-offset-4 hover:text-ink">
            Atrás
          </button>
        ) : backHref ? (
          <Link href={backHref} className="shrink-0 underline decoration-hairline underline-offset-4 hover:text-ink">
            Atrás
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** The five stages as a quiet list, shown before sign-in. */
export function OnboardingStagesPreview({ selectJourney }: { selectJourney: boolean }) {
  const stages: OnboardingStage[] = [1, 2, 3, 4, 5];
  return (
    <ol className="grid gap-0 border-t border-hairline text-left">
      {stages.map((s) => (
        <li key={s} className="flex items-baseline gap-4 border-b border-hairline py-3 text-[15px] text-ink">
          <span className="w-4 font-serif text-[17px] text-[var(--laton,#a8875a)]">{s}</span>
          {stageLabel(s, selectJourney)}
        </li>
      ))}
    </ol>
  );
}
