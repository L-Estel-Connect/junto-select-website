"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Timestamp } from "firebase/firestore";
import { aboutMeSteps } from "@/lib/introduction/aboutMeFields";
import { isEligibleAge } from "@/lib/introduction/age";
import { getNextOnboardingRoute } from "@/lib/introduction/completion";
import { markAboutMeComplete, saveStepAnswer } from "@/lib/introduction/profile";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import IneligibleAge from "./IneligibleAge";
import { IntroductionLoading } from "./RequireIntroductionAuth";
import StepQuestion from "./StepQuestion";

function getByPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      obj,
    );
}

export default function OnboardingWizard({ uid }: { uid: string }) {
  const router = useRouter();
  const { profile, mutate } = useSharedProfile(uid);
  // null = not yet initialized from the loaded profile. Only set once —
  // after that, stepIndex is locally controlled by this wizard, and must
  // NOT reset just because `profile` reference changes (e.g. a `mutate`
  // from this same component's own save, or a different tab's write
  // notifying this cache entry).
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ineligible, setIneligible] = useState(false);

  // Adjusting state during render (not in an effect) — the React-endorsed
  // pattern for "initialize local state from an async value exactly
  // once": https://react.dev/learn/you-might-not-need-an-effect. Setting
  // state here re-renders immediately with the new value before anything
  // commits, and the `stepIndex === null` guard is false on that very
  // next render, so this never loops and never fires as an extra
  // commit/effect the way doing this in a useEffect would.
  if (profile && stepIndex === null) {
    setStepIndex(Math.min(profile.meta.onboardingStepIndex, aboutMeSteps.length));
  }

  const totalSteps = aboutMeSteps.length;
  // Falls back to step 0 only before `stepIndex` is initialized from the
  // loaded profile — never actually rendered/used at that point, since
  // the loading guard below returns before reaching any JSX or handler
  // that reads `currentStep`. Keeps `currentStep`'s type exactly as
  // before (no `| undefined`) rather than threading an extra null case
  // through every existing use of it.
  const currentStep = aboutMeSteps[stepIndex ?? 0];
  const isComplete = Boolean(
    profile && (profile.meta.aboutMeComplete || (stepIndex !== null && stepIndex >= totalSteps)),
  );

  useEffect(() => {
    if (isComplete && profile) {
      router.replace(getNextOnboardingRoute(profile));
    }
  }, [isComplete, profile, router]);

  const currentValue = useMemo(() => {
    if (!profile || !currentStep) return undefined;
    if (currentStep.type === "children") {
      return {
        hasChildren: profile.visible.hasChildren,
        childrenCount: profile.visible.childrenCount,
      };
    }
    if (currentStep.type === "childrenAges") {
      return {
        childrenCount: profile.visible.childrenCount,
        childrenBirthYears: profile.visible.childrenBirthYears,
      };
    }
    if (currentStep.id === "birthDate") {
      const raw = profile.private.birthDate;
      return raw ? raw.toDate().toISOString().slice(0, 10) : undefined;
    }
    return getByPath(profile, currentStep.path);
  }, [profile, currentStep]);

  // The childrenAges step has no per-step branching in the wizard itself
  // (it's a strictly linear array walk) — instead, when it's reached but
  // doesn't apply (no children), this auto-advances past it with a null
  // answer rather than asking a meaningless question.
  useEffect(() => {
    if (!profile || !currentStep || saving) return;
    if (currentStep.type === "childrenAges" && profile.visible.hasChildren !== true) {
      void handleAnswer(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, currentStep, saving]);

  if (!profile || stepIndex === null || isComplete) {
    return <IntroductionLoading />;
  }

  if (ineligible) {
    return <IneligibleAge />;
  }

  async function handleAnswer(value: unknown) {
    if (stepIndex === null) return; // guarded against in render — defensive only
    setError(null);

    // Age eligibility is checked before anything is saved — a person
    // under 35 should never get a persisted birth date on their profile,
    // and never see a generic save error instead of a clear explanation.
    if (currentStep.id === "birthDate") {
      const birthDateISO = value as string;
      if (!isEligibleAge(birthDateISO)) {
        setIneligible(true);
        return;
      }
    }

    setSaving(true);

    const nextIndex = stepIndex + 1;

    const fields: Record<string, unknown> =
      currentStep.type === "children"
        ? (() => {
            const childrenValue = value as {
              hasChildren: boolean;
              childrenCount: number | null;
            };
            return {
              "visible.hasChildren": childrenValue.hasChildren,
              "visible.childrenCount": childrenValue.childrenCount,
            };
          })()
        : currentStep.type === "childrenAges"
          ? (() => {
              // Ages are what the person entered (simplest for them); what
              // gets stored is birth year, so this can never go stale — see
              // ProfileDocument.visible.childrenBirthYears.
              const ages = value as number[] | null;
              if (!ages) return { "visible.childrenBirthYears": null };
              const currentYear = new Date().getFullYear();
              return {
                "visible.childrenBirthYears": ages.map((age) => currentYear - age),
              };
            })()
          : currentStep.id === "birthDate"
            ? {
                [currentStep.path]: Timestamp.fromDate(
                  new Date(`${value as string}T00:00:00`),
                ),
              }
            : { [currentStep.path]: value };

    try {
      await saveStepAnswer(uid, fields, nextIndex);
      mutate((prev) => ({
        ...prev,
        meta: { ...prev.meta, onboardingStepIndex: nextIndex },
      }));

      if (nextIndex >= totalSteps) {
        await markAboutMeComplete(uid);
        mutate((prev) => ({ ...prev, meta: { ...prev.meta, aboutMeComplete: true } }));
      } else {
        setStepIndex(nextIndex);
      }
    } catch (err) {
      // Defense in depth: if Firestore's own security rule rejected the
      // write (e.g. a client/server clock edge case around the age
      // boundary), show the same elegant message rather than a generic
      // save error.
      const isPermissionDenied =
        err instanceof Error && err.message.includes("permission-denied");
      if (currentStep.id === "birthDate" && isPermissionDenied) {
        setIneligible(true);
      } else {
        setError("No hemos podido guardar tu respuesta. Inténtalo de nuevo.");
      }
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (stepIndex === null || stepIndex === 0) return;
    setError(null);
    setStepIndex(stepIndex - 1);
  }

  return (
    <div className="mx-auto flex min-h-[70svh] w-full max-w-[560px] flex-col justify-center px-6 py-10 sm:px-0">
      <div
        role="progressbar"
        aria-valuenow={stepIndex + 1}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        className="mb-10 h-1 w-full overflow-hidden rounded-full bg-hairline"
      >
        <div
          className="h-full rounded-full bg-rose-dark transition-all duration-300"
          style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
        />
      </div>

      <StepQuestion
        key={currentStep.id}
        step={currentStep}
        value={currentValue}
        saving={saving}
        onAnswer={handleAnswer}
      />

      {error && (
        <p role="alert" className="mt-4 text-sm text-[#8a3b3b]">
          {error}
        </p>
      )}

      {stepIndex > 0 && (
        <button
          type="button"
          onClick={handleBack}
          className="mt-8 self-start text-sm text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink"
        >
          Atrás
        </button>
      )}
    </div>
  );
}
