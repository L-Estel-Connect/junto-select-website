"use client";

import { useState } from "react";
import Link from "next/link";
import { aboutMeSteps, type AboutMeStep, type StepId } from "@/lib/introduction/aboutMeFields";
import { computeProfileStatus } from "@/lib/introduction/completion";
import { updateProfileFields } from "@/lib/introduction/profile";
import { applyFieldsToProfile, computeStepFields } from "./OnboardingWizard";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import type { ProfileDocument } from "@/lib/introduction/types";
import { primaryButtonClasses } from "@/lib/styles";
import { IntroductionError, IntroductionLoading } from "./RequireIntroductionAuth";

const linkClasses =
  "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

const inputClasses =
  "w-full rounded-md border border-hairline bg-paper px-4 py-3 text-[15px] text-ink placeholder:text-ink-soft/80 transition-colors focus:border-rose-dark focus:outline-none";

const cardOptionClasses = (checked: boolean) =>
  `w-full cursor-pointer rounded-md border px-5 py-4 text-left text-[15px] transition-colors ${
    checked ? "border-rose-dark bg-rose-tint text-ink" : "border-hairline text-ink hover:border-rose"
  }`;

const chipClasses = (checked: boolean) =>
  `rounded-full border px-5 py-3 text-[15px] transition-colors ${
    checked ? "border-rose-dark bg-rose-tint text-ink" : "border-hairline text-ink hover:border-rose"
  }`;

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
      if (profile.visible.hasYoungChildren === null) return "Sí (edad no especificada)";
      return profile.visible.hasYoungChildren
        ? "Sí, con hijos menores de 15 años"
        : "Sí, todos mayores de 15 años";
    default:
      return optionLabel(id, getByPath(profile, aboutMeSteps.find((s) => s.id === id)!.path) as string | null);
  }
}

type ChildrenDraft = { hasChildren: boolean | null; hasYoungChildren: boolean | null };

function initialDraftFor(step: AboutMeStep, profile: ProfileDocument): unknown {
  if (step.type === "children") {
    return {
      hasChildren: profile.visible.hasChildren,
      hasYoungChildren: profile.visible.hasYoungChildren,
    } satisfies ChildrenDraft;
  }
  return getByPath(profile, step.path);
}

/** Whether `draft` is a saveable answer for `step` — mirrors the validation each onboarding input already enforces via its own Continuar button. */
function isDraftValid(step: AboutMeStep, draft: unknown): boolean {
  switch (step.type) {
    case "text":
      return typeof draft === "string" && draft.trim().length > 0;
    case "number":
      if (!step.required) return true; // heightCm: null ("Prefiero no decirlo") is valid
      return typeof draft === "number" && Number.isFinite(draft) && draft >= step.min && draft <= step.max;
    case "select":
      return typeof draft === "string" && draft.length > 0;
    case "chips":
      return Array.isArray(draft) && draft.length > 0;
    case "children": {
      const d = draft as ChildrenDraft;
      if (d.hasChildren === null) return false;
      if (d.hasChildren === true && d.hasYoungChildren === null) return false;
      return true;
    }
    default:
      return true;
  }
}

function FieldEditor({
  step,
  draft,
  setDraft,
}: {
  step: AboutMeStep;
  draft: unknown;
  setDraft: (next: unknown) => void;
}) {
  switch (step.type) {
    case "text":
      return (
        <input
          type="text"
          autoFocus
          maxLength={step.maxLength}
          placeholder={step.placeholder}
          value={typeof draft === "string" ? draft : ""}
          onChange={(e) => setDraft(e.target.value)}
          className={inputClasses}
        />
      );
    case "number":
      return (
        <div>
          <input
            type="number"
            inputMode="numeric"
            autoFocus
            min={step.min}
            max={step.max}
            placeholder={step.placeholder}
            value={typeof draft === "number" ? draft : ""}
            onChange={(e) => setDraft(e.target.value === "" ? null : Number(e.target.value))}
            className={inputClasses}
          />
          {!step.required && (
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="mt-3 text-sm text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink"
            >
              {step.skippableLabel}
            </button>
          )}
        </div>
      );
    case "select":
      return (
        <div className="space-y-3">
          {step.options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setDraft(option.value)}
              className={cardOptionClasses(draft === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      );
    case "chips": {
      const selected = Array.isArray(draft) ? (draft as string[]) : [];
      return (
        <div className="flex flex-wrap gap-2.5">
          {step.options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setDraft(checked ? selected.filter((v) => v !== option.value) : [...selected, option.value])
                }
                className={chipClasses(checked)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }
    case "children": {
      const d = draft as ChildrenDraft;
      return (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setDraft({ hasChildren: false, hasYoungChildren: false } satisfies ChildrenDraft)}
            className={cardOptionClasses(d.hasChildren === false)}
          >
            No tengo hijos
          </button>
          <button
            type="button"
            onClick={() => setDraft({ hasChildren: true, hasYoungChildren: false } satisfies ChildrenDraft)}
            className={cardOptionClasses(d.hasChildren === true && d.hasYoungChildren === false)}
          >
            Sí, y todos tienen 15 años o más
          </button>
          <button
            type="button"
            onClick={() => setDraft({ hasChildren: true, hasYoungChildren: true } satisfies ChildrenDraft)}
            className={cardOptionClasses(d.hasChildren === true && d.hasYoungChildren === true)}
          >
            Sí, y al menos uno tiene menos de 15 años
          </button>
        </div>
      );
    }
    default:
      return null;
  }
}

export default function AboutMeEditSection({ uid }: { uid: string }) {
  const { profile, error: profileError, refresh: refreshProfile, mutate } = useSharedProfile(uid);
  const [expandedId, setExpandedId] = useState<StepId | null>(null);
  // The value the user is currently choosing/typing for `expandedId` —
  // deliberately separate from `profile`, which stays whatever was last
  // successfully SAVED. This is the fix for the reported bug: the
  // previous version rendered the "selected" option directly from the
  // cached profile and saved on every click with no confirm step, so a
  // slow or failed write had nothing of the user's own to fall back to —
  // the visible selection simply reverted with no way to tell what
  // happened or retry. Now a click only ever updates this local draft;
  // Firestore is touched only when the user presses "Guardar", and a
  // failed save leaves this draft exactly as the user left it.
  const [draft, setDraft] = useState<unknown>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) {
    if (profileError) {
      return <IntroductionError message={profileError} onRetry={() => void refreshProfile()} />;
    }
    return <IntroductionLoading />;
  }

  function handleEdit(id: StepId) {
    if (!profile) return;
    const step = aboutMeSteps.find((s) => s.id === id)!;
    setError(null);
    setDraft(initialDraftFor(step, profile));
    setExpandedId(id);
  }

  function handleCancel() {
    setError(null);
    setExpandedId(null);
    setDraft(undefined);
  }

  async function handleSave() {
    if (!profile || !expandedId) return;
    const step = aboutMeSteps.find((s) => s.id === expandedId)!;
    setError(null);
    setSaving(true);
    try {
      const fields = computeStepFields(step, draft);
      // A self-attribute edit can make a profile that was matching-eligible
      // stop being so (e.g. hasChildren flipped to true but birth years
      // aren't answered yet) — or the reverse, once completed. Recompute
      // and persist meta.profileStatus on every save here, exactly like
      // preferences.ts/photos.ts/presentation.ts already do for their own
      // sections; loadEligiblePool (engine.ts) filters by this STORED
      // field, never by recomputing isAboutMeComplete itself, so leaving
      // it stale would silently keep an incomplete profile eligible (or
      // keep a now-complete one excluded).
      const updatedProfile = applyFieldsToProfile(profile, fields);
      const profileStatus = computeProfileStatus(updatedProfile);
      await updateProfileFields(uid, fields, { profileStatus });
      mutate(() => ({ ...updatedProfile, meta: { ...updatedProfile.meta, profileStatus } }));
      setExpandedId(null);
      setDraft(undefined);
    } catch {
      // Deliberately does NOT touch `draft` or `expandedId` — the user's
      // chosen-but-unsaved value stays visible and selected exactly as
      // they left it, and the error renders right next to Guardar so
      // retrying is a single obvious click, not a guess.
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
        Elige un valor y confirma con Guardar para actualizarlo.
      </p>

      <div className="mt-8">
        {EDITABLE_STEP_IDS.map((id) => {
          const step = aboutMeSteps.find((s) => s.id === id)!;
          const expanded = expandedId === id;
          return (
            <div key={id} className="border-b border-hairline py-5 first:pt-0 last:border-b-0">
              {expanded ? (
                <div>
                  <p className="text-[16px] text-ink">{step.question}</p>
                  {step.helper && <p className="mt-1 text-[13px] text-ink-soft">{step.helper}</p>}
                  <div className="mt-4">
                    <FieldEditor step={step} draft={draft} setDraft={setDraft} />
                  </div>

                  {error && (
                    <p role="alert" className="mt-4 text-sm text-[#8a3b3b]">
                      {error}
                    </p>
                  )}

                  <div className="mt-6 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      disabled={saving || !isDraftValid(step, draft)}
                      onClick={() => void handleSave()}
                      className={primaryButtonClasses}
                    >
                      {saving ? "Guardando…" : "Guardar"}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleCancel}
                      className="text-sm text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleEdit(id)}
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
