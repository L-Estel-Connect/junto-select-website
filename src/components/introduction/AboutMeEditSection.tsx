"use client";

import { useState } from "react";
import Link from "next/link";
import { aboutMeSteps, type StepId } from "@/lib/introduction/aboutMeFields";
import { updateProfileFields } from "@/lib/introduction/profile";
import { applyFieldsToProfile, computeStepFields } from "./OnboardingWizard";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import type { ProfileDocument } from "@/lib/introduction/types";
import StepQuestion from "./StepQuestion";
import { IntroductionError, IntroductionLoading } from "./RequireIntroductionAuth";

const linkClasses =
  "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

/**
 * Self-attribute fields a member can correct after onboarding — the
 * "Sobre ti" audit's central finding was that NONE of these had any edit
 * path at all, even though every one of them is read by someone else's
 * hard filter or scoring (see hardFilters.ts/scoring.ts). Deliberately
 * excludes `firstName`, `gender`, `birthDate`, and `incomeRange`:
 * `gender` and `birthDate` are identity/eligibility-bearing fields (age
 * eligibility, `market`/matching-pool gender balance) that should not be
 * casually self-editable without separate product/security analysis —
 * see the implementation report for the explicit decision to leave them
 * out of this first pass. `incomeRange` and `firstName` were simply not
 * part of the approved field list for this change.
 */
const EDITABLE_STEP_IDS: StepId[] = [
  "city",
  "profession",
  "educationLevel",
  "heightCm",
  "languages",
  "children",
  "childrenAges",
  "relationshipIntention",
  "smoking",
  "drinking",
  "activityLevel",
  "wantsFutureChildren",
  "marketAvailability",
];

function getByPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      obj,
    );
}

function optionLabel(stepId: StepId, value: string | null): string {
  if (value === null) return "No especificado";
  const step = aboutMeSteps.find((s) => s.id === stepId);
  if (!step || !("options" in step)) return value;
  return step.options.find((o) => o.value === value)?.label ?? value;
}

function summarize(profile: ProfileDocument, id: StepId): string {
  switch (id) {
    case "city":
      return profile.visible.city.trim() || "No especificado";
    case "profession":
      return profile.visible.profession.trim() || "No especificado";
    case "heightCm":
      return profile.visible.heightCm ? `${profile.visible.heightCm} cm` : "No especificado";
    case "languages":
      return profile.visible.languages.length > 0
        ? profile.visible.languages.map((v) => optionLabel("languages", v)).join(", ")
        : "No especificado";
    case "children":
      if (profile.visible.hasChildren === null) return "No especificado";
      if (profile.visible.hasChildren === false) return "No";
      return `Sí (${profile.visible.childrenCount ?? "?"})`;
    case "childrenAges": {
      const years = profile.visible.childrenBirthYears;
      if (!years || years.length === 0) return "No especificado";
      const currentYear = new Date().getFullYear();
      return years.map((y) => `${currentYear - y} años`).join(", ");
    }
    default:
      return optionLabel(id, getByPath(profile, aboutMeSteps.find((s) => s.id === id)!.path) as string | null);
  }
}

export default function AboutMeEditSection({ uid }: { uid: string }) {
  const { profile, error: profileError, refresh: refreshProfile, mutate } = useSharedProfile(uid);
  const [expandedId, setExpandedId] = useState<StepId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) {
    if (profileError) {
      return <IntroductionError message={profileError} onRetry={() => void refreshProfile()} />;
    }
    return <IntroductionLoading />;
  }

  const visibleFieldIds = EDITABLE_STEP_IDS.filter(
    (id) => id !== "childrenAges" || profile.visible.hasChildren === true,
  );

  async function handleAnswer(stepId: StepId, value: unknown) {
    const step = aboutMeSteps.find((s) => s.id === stepId)!;
    setError(null);
    setSaving(true);
    try {
      const fields = computeStepFields(step, value);
      // Stale-data hygiene: if this edit just turned "¿Tienes hijos?" to
      // No, any previously stored birth years no longer describe anyone —
      // clear them rather than leaving inapplicable data behind (they'd
      // otherwise be invisible in this UI, since the row is hidden
      // whenever hasChildren isn't true, but would still linger in
      // Firestore untouched).
      if (
        stepId === "children" &&
        (value as { hasChildren: boolean }).hasChildren === false
      ) {
        fields["visible.childrenBirthYears"] = null;
      }
      await updateProfileFields(uid, fields);
      mutate((prev) => applyFieldsToProfile(prev, fields));
      setExpandedId(null);
    } catch {
      setError("No hemos podido guardar tu respuesta. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col px-6 py-14 sm:px-0">
      <Link href="/member/profile" className={`text-sm ${linkClasses}`}>
        ← Volver a mi perfil
      </Link>

      <h1 className="mt-6 font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Sobre ti
      </h1>
      <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
        Tus respuestas se guardan automáticamente en cuanto las confirmas.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-[#8a3b3b]">
          {error}
        </p>
      )}

      <div className="mt-8">
        {visibleFieldIds.map((id) => {
          const step = aboutMeSteps.find((s) => s.id === id)!;
          const expanded = expandedId === id;
          return (
            <div key={id} className="border-b border-hairline py-5 first:pt-0 last:border-b-0">
              {expanded ? (
                <div>
                  <StepQuestion
                    step={step}
                    value={
                      step.type === "children"
                        ? { hasChildren: profile.visible.hasChildren, childrenCount: profile.visible.childrenCount }
                        : step.type === "childrenAges"
                          ? {
                              childrenCount: profile.visible.childrenCount,
                              childrenBirthYears: profile.visible.childrenBirthYears,
                            }
                          : getByPath(profile, step.path)
                    }
                    saving={saving}
                    onAnswer={(value) => void handleAnswer(id, value)}
                  />
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setExpandedId(null)}
                    className="mt-4 text-sm text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setExpandedId(id)}
                  className="flex w-full items-center justify-between gap-4 text-left hover:opacity-70"
                >
                  <span>
                    <span className="block text-[15px] text-ink">{step.question}</span>
                    <span className="mt-1 block text-[13px] text-ink-soft">{summarize(profile, id)}</span>
                  </span>
                  <span className={`shrink-0 text-sm ${linkClasses}`}>Editar</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
