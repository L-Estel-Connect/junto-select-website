"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Timestamp } from "firebase/firestore";
import { aboutMeSteps, type AboutMeStep } from "@/lib/introduction/aboutMeFields";
import { isEligibleAge } from "@/lib/introduction/age";
import { getNextOnboardingRoute, isAboutMeComplete } from "@/lib/introduction/completion";
import { markAboutMeComplete, saveStepAnswer } from "@/lib/introduction/profile";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import { logDebugEvent } from "@/lib/introduction/onboardingDebug";
import type { ProfileDocument } from "@/lib/introduction/types";
import IneligibleAge from "./IneligibleAge";
import { IntroductionError, IntroductionLoading } from "./RequireIntroductionAuth";
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

/**
 * Applies a `saveStepAnswer`-style `{"section.field": value}` map onto a
 * shallow clone of the cached profile, so the LOCAL cache reflects what
 * was just written to Firestore immediately — not only after some later
 * full refetch. Every path used anywhere in this wizard is exactly two
 * segments (`visible.*` / `private.*` — see FieldPath in aboutMeFields.ts),
 * so this only ever needs to merge one level deep.
 *
 * Root-cause fix: handleAnswer previously only patched `meta` fields into
 * the cache (onboardingStepIndex, then aboutMeComplete), never the actual
 * answered field. That was invisible for a normal mid-flow step, since the
 * wizard immediately moves on to a DIFFERENT question. It broke two things
 * that both depend on the cache already reflecting the JUST-saved answer:
 * (1) the last step in `aboutMeSteps` (whichever one that is) — completing
 * it never advanced past it or redirected, because `isAboutMeComplete`
 * re-checked the still-stale cached copy and kept seeing that field as
 * unanswered; (2) the childrenAges auto-skip effect a few steps later,
 * which reads the cached `hasChildren` and — still seeing the stale `null`
 * from before the children step's own save — treated every "yes, I have
 * children" answer as unanswered and silently skipped straight past the
 * birth-year question.
 */
export function applyFieldsToProfile(
  profile: ProfileDocument,
  fields: Record<string, unknown>,
): ProfileDocument {
  let next = profile;
  for (const [path, value] of Object.entries(fields)) {
    const [section, key] = path.split(".");
    if (section !== "visible" && section !== "private" && section !== "meta") continue;
    next = { ...next, [section]: { ...next[section], [key]: value } };
  }
  return next;
}

/**
 * Whether `step` already has a real answer on `profile` — the per-step
 * building block for `firstUnansweredStepIndex` below. Mirrors the
 * per-field checks in completion.ts's `isAboutMeComplete` (the
 * authoritative definition also used by the matching engine and
 * `getNextOnboardingRoute`), rather than re-deriving its own notion of
 * "answered".
 */
export function isStepAnswered(profile: ProfileDocument, step: AboutMeStep): boolean {
  if (step.type === "children") return profile.visible.hasChildren !== null;
  if (step.type === "childrenAges") {
    if (profile.visible.hasChildren !== true) return true; // doesn't apply
    return (
      profile.visible.childrenBirthYears !== null &&
      profile.visible.childrenBirthYears.length === profile.visible.childrenCount
    );
  }
  const value = getByPath(profile, step.path);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

/**
 * Finds the first step (in wizard order) that still needs an answer,
 * regardless of what `profile.meta.onboardingStepIndex` says. Exists for
 * one specific, real scenario: an account whose About Me was marked
 * complete under an OLDER, shorter version of `aboutMeSteps` (before a
 * question — e.g. `marketAvailability` — was added later) has a stored
 * index at or past the CURRENT `aboutMeSteps.length`, but is missing a
 * real answer for the newer step. Trusting the stored index there would
 * have the wizard try to redirect to whatever page comes after Sobre ti —
 * except `getNextOnboardingRoute` (using the same authoritative
 * `isAboutMeComplete`) disagrees and sends it right back here, an
 * infinite self-redirect that never renders anything to answer. Resuming
 * at the actual first gap fixes it by asking the one missing question
 * instead of looping.
 */
export function firstUnansweredStepIndex(profile: ProfileDocument): number {
  const index = aboutMeSteps.findIndex((step) => !isStepAnswered(profile, step));
  return index === -1 ? aboutMeSteps.length : index;
}

/**
 * Maps one step's raw answer `value` (as produced by StepQuestion/its
 * per-type input components) to the `{"section.field": value}` map
 * `saveStepAnswer` writes to Firestore and `applyFieldsToProfile` mirrors
 * into the local cache. Pure and exported so the exact field-mapping this
 * wizard relies on can be tested directly, without rendering the wizard.
 */
export function computeStepFields(
  step: AboutMeStep,
  value: unknown,
): Record<string, unknown> {
  if (step.type === "children") {
    const childrenValue = value as { hasChildren: boolean; childrenCount: number | null };
    return {
      "visible.hasChildren": childrenValue.hasChildren,
      "visible.childrenCount": childrenValue.childrenCount,
    };
  }
  if (step.type === "childrenAges") {
    // Ages are what the person entered (simplest for them); what gets
    // stored is birth year, so this can never go stale — see
    // ProfileDocument.visible.childrenBirthYears.
    const ages = value as number[] | null;
    if (!ages) return { "visible.childrenBirthYears": null };
    const currentYear = new Date().getFullYear();
    return { "visible.childrenBirthYears": ages.map((age) => currentYear - age) };
  }
  if (step.id === "birthDate") {
    return { [step.path]: Timestamp.fromDate(new Date(`${value as string}T00:00:00`)) };
  }
  return { [step.path]: value };
}

export default function OnboardingWizard({ uid }: { uid: string }) {
  const router = useRouter();
  const { profile, error: profileError, refresh: refreshProfile, mutate } = useSharedProfile(uid);
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
    const storedIndex = Math.min(profile.meta.onboardingStepIndex, aboutMeSteps.length);
    // See firstUnansweredStepIndex's own comment: only fall back to it
    // when the stored index claims "done" but the authoritative check
    // disagrees — the normal, non-legacy case (still mid-flow, or
    // genuinely complete) always just uses the stored index as before.
    const initialIndex =
      storedIndex >= aboutMeSteps.length && !isAboutMeComplete(profile)
        ? firstUnansweredStepIndex(profile)
        : storedIndex;
    setStepIndex(initialIndex);
  }

  const totalSteps = aboutMeSteps.length;
  // Falls back to step 0 only before `stepIndex` is initialized from the
  // loaded profile — never actually rendered/used at that point, since
  // the loading guard below returns before reaching any JSX or handler
  // that reads `currentStep`. Keeps `currentStep`'s type exactly as
  // before (no `| undefined`) rather than threading an extra null case
  // through every existing use of it.
  const currentStep = aboutMeSteps[stepIndex ?? 0];
  // The authoritative definition (also used by the matching engine and
  // getNextOnboardingRoute) — NOT the historical `meta.aboutMeComplete`
  // flag, which can be stale for an account that was marked complete
  // before a later question existed. Using the same check here that
  // getNextOnboardingRoute uses is what guarantees they can never
  // disagree about whether this page still has something to ask.
  const isComplete = Boolean(profile && isAboutMeComplete(profile));

  useEffect(() => {
    logDebugEvent(
      "COMPLETION_STATE_CALCULATED",
      `isComplete=${isComplete} aboutMeComplete=${profile?.meta.aboutMeComplete} stepIndex=${stepIndex}/${totalSteps}`,
    );
    if (isComplete && profile) {
      const nextRoute = getNextOnboardingRoute(profile);
      logDebugEvent("NEXT_ROUTE_CALCULATED", nextRoute);
      logDebugEvent("REDIRECT", nextRoute);
      router.replace(nextRoute);
    }
  }, [isComplete, profile, router, stepIndex, totalSteps]);

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

  const renderState = !profile
    ? profileError
      ? "RENDER_ERROR_STATE"
      : "RENDER_LOADING(no profile yet)"
    : stepIndex === null
      ? "RENDER_LOADING(stepIndex not initialized)"
      : isComplete
        ? "RENDER_LOADING(complete, awaiting redirect)"
        : ineligible
          ? "RENDER_INELIGIBLE"
          : "RENDER_CONTENT";
  useEffect(() => {
    logDebugEvent("RENDER_STATE", renderState);
  }, [renderState]);

  if (!profile) {
    if (profileError) {
      return <IntroductionError message={profileError} onRetry={() => void refreshProfile()} />;
    }
    return <IntroductionLoading />;
  }

  if (stepIndex === null || isComplete) {
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

    const fields = computeStepFields(currentStep, value);

    try {
      await saveStepAnswer(uid, fields, nextIndex);
      mutate((prev) => {
        const updated = applyFieldsToProfile(prev, fields);
        return { ...updated, meta: { ...updated.meta, onboardingStepIndex: nextIndex } };
      });

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
