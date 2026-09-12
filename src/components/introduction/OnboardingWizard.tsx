"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Timestamp } from "firebase/firestore";
import { aboutMeSteps } from "@/lib/introduction/aboutMeFields";
import { isEligibleAge } from "@/lib/introduction/age";
import {
  getOrCreateProfile,
  markAboutMeComplete,
  saveStepAnswer,
} from "@/lib/introduction/profile";
import type { ProfileDocument } from "@/lib/introduction/types";
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
  const [profile, setProfile] = useState<ProfileDocument | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ineligible, setIneligible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOrCreateProfile(uid).then((doc) => {
      if (cancelled) return;
      setProfile(doc);
      setStepIndex(
        Math.min(doc.meta.onboardingStepIndex, aboutMeSteps.length),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const totalSteps = aboutMeSteps.length;
  const currentStep = aboutMeSteps[stepIndex];
  const isComplete = Boolean(
    profile && (profile.meta.aboutMeComplete || stepIndex >= totalSteps),
  );

  useEffect(() => {
    if (isComplete) {
      router.replace("/introduction/home");
    }
  }, [isComplete, router]);

  const currentValue = useMemo(() => {
    if (!profile || !currentStep) return undefined;
    if (currentStep.type === "children") {
      return {
        hasChildren: profile.visible.hasChildren,
        childrenCount: profile.visible.childrenCount,
      };
    }
    if (currentStep.id === "birthDate") {
      const raw = profile.private.birthDate;
      return raw ? raw.toDate().toISOString().slice(0, 10) : undefined;
    }
    return getByPath(profile, currentStep.path);
  }, [profile, currentStep]);

  if (!profile || isComplete) {
    return <IntroductionLoading />;
  }

  if (ineligible) {
    return <IneligibleAge />;
  }

  async function handleAnswer(value: unknown) {
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
        : currentStep.id === "birthDate"
          ? {
              [currentStep.path]: Timestamp.fromDate(
                new Date(`${value as string}T00:00:00`),
              ),
            }
          : { [currentStep.path]: value };

    try {
      await saveStepAnswer(uid, fields, nextIndex);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              meta: { ...prev.meta, onboardingStepIndex: nextIndex },
            }
          : prev,
      );

      if (nextIndex >= totalSteps) {
        await markAboutMeComplete(uid);
        setProfile((prev) =>
          prev
            ? { ...prev, meta: { ...prev.meta, aboutMeComplete: true } }
            : prev,
        );
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
    if (stepIndex === 0) return;
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
