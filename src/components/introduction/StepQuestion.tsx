"use client";

import { useState } from "react";
import type { AboutMeStep } from "@/lib/introduction/aboutMeFields";
import { primaryButtonClasses } from "@/lib/styles";

const cardOptionClasses = (checked: boolean) =>
  `choice-card ${checked ? "choice-selected" : ""} w-full cursor-pointer rounded-md border bg-white/60 px-5 py-4 text-left text-[16px] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-rose-dark ${
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
      <h1 className="font-serif text-[30px] font-normal leading-[1.15] text-ink sm:text-[40px]">
        {step.question}
      </h1>
      {step.helper && (
        <p className={`mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft ${step.private ? "flex items-start gap-2" : ""}`}>
          {step.private && <PrivateIcon />}
          <span>{step.helper}</span>
        </p>
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
    default:
      return null;
  }
}

/** Small lock shown before the privacy note of private answers. */
function PrivateIcon() {
  return (
    <svg aria-hidden viewBox="0 0 12 14" className="mt-[5px] h-[13px] w-[11px] flex-none" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="1" y="6" width="10" height="7" rx="1" />
      <path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

/**
 * On a phone the button sits in a bar fixed to the bottom of the screen,
 * within reach of the thumb; when it can't be used yet, a line says why.
 */
function ContinueButton({
  disabled,
  saving,
  onClick,
  hint,
}: {
  disabled?: boolean;
  saving: boolean;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-6 mt-6 border-t border-hairline bg-paper px-6 pb-[max(env(safe-area-inset-bottom),16px)] pt-4 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
      <button
        type="button"
        disabled={disabled || saving}
        onClick={onClick}
        className={`${primaryButtonClasses} w-full`}
      >
        {saving ? "Guardando…" : "Continuar"}
      </button>
      {disabled && !saving && hint && (
        <p className="mt-2 text-center text-[13px] text-ink-soft">{hint}</p>
      )}
    </div>
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
        hint="Escribe tu respuesta para continuar."
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
        hint={`Escribe un número entre ${numberStep.min} y ${numberStep.max}.`}
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
      <ContinueButton disabled={!isValid} saving={saving} onClick={() => onAnswer(text)} hint="Indica tu fecha de nacimiento para continuar." />
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
      <p className="mb-4 text-[13px] text-ink-soft">Puedes elegir varias.</p>
      <div className="flex flex-wrap gap-2.5">
        {chipsStep.options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              disabled={saving}
              onClick={() => toggle(option.value)}
              aria-pressed={checked}
              className={`rounded-full border px-5 py-3 text-[15px] transition-colors ${
                checked
                  ? "border-rose-dark bg-rose-tint text-ink"
                  : "border-hairline bg-white/60 text-ink hover:border-rose"
              }`}
            >
              {checked && <span aria-hidden className="mr-1.5 text-rose-dark">✓</span>}
              {option.label}
            </button>
          );
        })}
      </div>
      <ContinueButton
        disabled={selected.length === 0}
        saving={saving}
        onClick={() => onAnswer(selected)}
        hint="Elige al menos una opción."
      />
    </div>
  );
}

/**
 * A single three-option question that writes both `hasChildren` and
 * `hasYoungChildren` atomically in one click — see aboutMeFields.ts's
 * `ChildrenStep` doc comment for why there's no separate count/ages
 * question anymore. Modeled after `SelectInput` (answers immediately on
 * click, no separate Continuar step) since it's really a single select
 * over three options, just one that happens to set two underlying fields.
 */
type ChildrenAnswer = "none" | "grown" | "young";

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
    | { hasChildren: boolean | null; hasYoungChildren: boolean | null }
    | undefined;
  const selected: ChildrenAnswer | null =
    initial?.hasChildren === false
      ? "none"
      : initial?.hasChildren === true && initial?.hasYoungChildren === true
        ? "young"
        : initial?.hasChildren === true && initial?.hasYoungChildren === false
          ? "grown"
          : null;

  function select(answer: ChildrenAnswer) {
    if (answer === "none") onAnswer({ hasChildren: false, hasYoungChildren: false });
    else if (answer === "grown") onAnswer({ hasChildren: true, hasYoungChildren: false });
    else onAnswer({ hasChildren: true, hasYoungChildren: true });
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={saving}
        onClick={() => select("none")}
        className={cardOptionClasses(selected === "none")}
      >
        No tengo hijos
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => select("grown")}
        className={cardOptionClasses(selected === "grown")}
      >
        Sí, y todos tienen 15 años o más
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => select("young")}
        className={cardOptionClasses(selected === "young")}
      >
        Sí, y al menos uno tiene menos de 15 años
      </button>
    </div>
  );
}
