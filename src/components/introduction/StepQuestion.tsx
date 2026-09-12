"use client";

import { useState } from "react";
import type { AboutMeStep } from "@/lib/introduction/aboutMeFields";
import { primaryButtonClasses } from "@/lib/styles";

const cardOptionClasses = (checked: boolean) =>
  `w-full cursor-pointer rounded-md border px-5 py-4 text-left text-[16px] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-rose-dark ${
    checked
      ? "border-rose-dark bg-rose-tint text-ink"
      : "border-hairline text-ink hover:border-rose"
  }`;

const inputClasses =
  "w-full rounded-md border border-hairline bg-paper px-4 py-4 text-[16px] text-ink placeholder:text-ink-soft/80 transition-colors focus:border-rose-dark focus:outline-none";

interface Props {
  step: AboutMeStep;
  value: unknown;
  saving: boolean;
  onAnswer: (value: unknown) => void;
}

export default function StepQuestion({ step, value, saving, onAnswer }: Props) {
  return (
    <div>
      <h1 className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-3xl">
        {step.question}
      </h1>
      {step.helper && (
        <p className="mt-2 text-[15px] text-ink-soft">{step.helper}</p>
      )}

      <div className="mt-8">
        <StepInput step={step} value={value} saving={saving} onAnswer={onAnswer} />
      </div>
    </div>
  );
}

function StepInput({ step, value, saving, onAnswer }: Props) {
  switch (step.type) {
    case "text":
      return <TextInput step={step} value={value} saving={saving} onAnswer={onAnswer} />;
    case "number":
      return <NumberInput step={step} value={value} saving={saving} onAnswer={onAnswer} />;
    case "date":
      return <DateInput step={step} value={value} saving={saving} onAnswer={onAnswer} />;
    case "select":
      return <SelectInput step={step} value={value} saving={saving} onAnswer={onAnswer} />;
    case "chips":
      return <ChipsInput step={step} value={value} saving={saving} onAnswer={onAnswer} />;
    case "children":
      return <ChildrenInput value={value} saving={saving} onAnswer={onAnswer} />;
    case "childrenAges":
      return <ChildrenAgesInput value={value} saving={saving} onAnswer={onAnswer} />;
    default:
      return null;
  }
}

function ContinueButton({
  disabled,
  saving,
  onClick,
}: {
  disabled?: boolean;
  saving: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || saving}
      onClick={onClick}
      className={`${primaryButtonClasses} mt-6 w-full`}
    >
      {saving ? "Guardando…" : "Continuar"}
    </button>
  );
}

function TextInput({ step, value, saving, onAnswer }: Props) {
  const textStep = step as Extract<AboutMeStep, { type: "text" }>;
  const [text, setText] = useState(typeof value === "string" ? value : "");

  return (
    <div>
      <input
        type="text"
        autoFocus
        value={text}
        maxLength={textStep.maxLength}
        placeholder={textStep.placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) onAnswer(text.trim());
        }}
        className={inputClasses}
      />
      <ContinueButton
        disabled={!text.trim()}
        saving={saving}
        onClick={() => onAnswer(text.trim())}
      />
    </div>
  );
}

function NumberInput({ step, value, saving, onAnswer }: Props) {
  const numberStep = step as Extract<AboutMeStep, { type: "number" }>;
  const [text, setText] = useState(
    typeof value === "number" ? String(value) : "",
  );

  const parsed = Number(text);
  const isValid =
    text.trim() !== "" &&
    Number.isFinite(parsed) &&
    parsed >= numberStep.min &&
    parsed <= numberStep.max;

  return (
    <div>
      <input
        type="number"
        inputMode="numeric"
        autoFocus
        value={text}
        placeholder={numberStep.placeholder}
        min={numberStep.min}
        max={numberStep.max}
        onChange={(e) => setText(e.target.value)}
        className={inputClasses}
      />
      <ContinueButton
        disabled={!isValid}
        saving={saving}
        onClick={() => onAnswer(parsed)}
      />
      {!numberStep.required && (
        <button
          type="button"
          disabled={saving}
          onClick={() => onAnswer(null)}
          className="mt-4 w-full text-center text-sm text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink"
        >
          {numberStep.skippableLabel}
        </button>
      )}
    </div>
  );
}

function DateInput({ value, saving, onAnswer }: Props) {
  const [text, setText] = useState(typeof value === "string" ? value : "");
  const isValid = /^\d{4}-\d{2}-\d{2}$/.test(text);

  return (
    <div>
      <input
        type="date"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={inputClasses}
      />
      <ContinueButton disabled={!isValid} saving={saving} onClick={() => onAnswer(text)} />
    </div>
  );
}

function SelectInput({ step, value, saving, onAnswer }: Props) {
  const selectStep = step as Extract<AboutMeStep, { type: "select" }>;

  return (
    <div className="space-y-3">
      {selectStep.options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={saving}
          onClick={() => onAnswer(option.value)}
          className={cardOptionClasses(value === option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ChipsInput({ step, value, saving, onAnswer }: Props) {
  const chipsStep = step as Extract<AboutMeStep, { type: "chips" }>;
  const [selected, setSelected] = useState<string[]>(
    Array.isArray(value) ? (value as string[]) : [],
  );

  function toggle(optionValue: string) {
    setSelected((prev) =>
      prev.includes(optionValue)
        ? prev.filter((v) => v !== optionValue)
        : [...prev, optionValue],
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {chipsStep.options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              disabled={saving}
              onClick={() => toggle(option.value)}
              className={`rounded-full border px-5 py-3 text-[15px] transition-colors ${
                checked
                  ? "border-rose-dark bg-rose-tint text-ink"
                  : "border-hairline text-ink hover:border-rose"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <ContinueButton
        disabled={selected.length === 0}
        saving={saving}
        onClick={() => onAnswer(selected)}
      />
    </div>
  );
}

function ChildrenInput({
  value,
  saving,
  onAnswer,
}: {
  value: unknown;
  saving: boolean;
  onAnswer: (value: unknown) => void;
}) {
  const initial = value as
    | { hasChildren: boolean | null; childrenCount: number | null }
    | undefined;
  const [hasChildren, setHasChildren] = useState<boolean | null>(
    initial?.hasChildren ?? null,
  );
  const [count, setCount] = useState<number | null>(
    initial?.childrenCount ?? null,
  );

  function selectHasChildren(next: boolean) {
    setHasChildren(next);
    setCount(null);
  }

  return (
    <div>
      <div className="space-y-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => selectHasChildren(true)}
          className={cardOptionClasses(hasChildren === true)}
        >
          Sí
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => selectHasChildren(false)}
          className={cardOptionClasses(hasChildren === false)}
        >
          No
        </button>
      </div>

      {hasChildren === true && (
        <div className="mt-6">
          <p className="mb-3 text-[15px] text-ink-soft">¿Cuántos?</p>
          <div className="flex gap-2.5">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                disabled={saving}
                onClick={() => setCount(n)}
                className={`flex-1 rounded-full border px-4 py-3 text-[15px] transition-colors ${
                  count === n
                    ? "border-rose-dark bg-rose-tint text-ink"
                    : "border-hairline text-ink hover:border-rose"
                }`}
              >
                {n === 3 ? "3+" : n}
              </button>
            ))}
          </div>
        </div>
      )}

      <ContinueButton
        disabled={hasChildren === null || (hasChildren === true && count === null)}
        saving={saving}
        onClick={() =>
          onAnswer({ hasChildren, childrenCount: hasChildren ? count : null })
        }
      />
    </div>
  );
}

/**
 * Asks for each child's current age (simplest for the person to answer),
 * but the value handed to `onAnswer` — and what actually gets persisted,
 * via OnboardingWizard's field-mapping for this step — is birth YEAR, not
 * the age itself, so it never goes stale. This component only ever
 * renders when OnboardingWizard has already determined hasChildren is
 * true (see its auto-skip effect); `value.childrenCount` drives how many
 * age inputs to show.
 */
function ChildrenAgesInput({
  value,
  saving,
  onAnswer,
}: {
  value: unknown;
  saving: boolean;
  onAnswer: (value: unknown) => void;
}) {
  const initial = value as
    | { childrenCount: number | null; childrenBirthYears: number[] | null }
    | undefined;
  const count = initial?.childrenCount ?? 0;
  const currentYear = new Date().getFullYear();
  const initialAges = (initial?.childrenBirthYears ?? []).map(
    (year) => currentYear - year,
  );
  const [ages, setAges] = useState<Array<number | null>>(
    Array.from({ length: count }, (_, i) => initialAges[i] ?? null),
  );

  const allFilled =
    ages.length === count &&
    ages.every((a) => a !== null && a >= 0 && a <= 90);

  function setAge(index: number, raw: string) {
    if (raw.trim() === "") {
      setAges((prev) => prev.map((a, i) => (i === index ? null : a)));
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    setAges((prev) => prev.map((a, i) => (i === index ? parsed : a)));
  }

  return (
    <div>
      <div className="space-y-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i}>
            <p className="mb-2 text-[14px] text-ink-soft">Hijo/a {i + 1}</p>
            <input
              type="number"
              inputMode="numeric"
              autoFocus={i === 0}
              min={0}
              max={90}
              value={ages[i] ?? ""}
              onChange={(e) => setAge(i, e.target.value)}
              className={inputClasses}
            />
          </div>
        ))}
      </div>
      <ContinueButton
        disabled={!allFilled}
        saving={saving}
        onClick={() => onAnswer(ages as number[])}
      />
    </div>
  );
}
