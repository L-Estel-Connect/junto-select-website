"use client";

import type { ReactNode } from "react";

const chipClasses = (checked: boolean) =>
  `rounded-full border px-5 py-3 text-[15px] transition-colors ${
    checked
      ? "border-rose-dark bg-rose-tint text-ink"
      : "border-hairline bg-white/60 text-ink hover:border-rose"
  }`;

function Tick() {
  return <span aria-hidden className="mr-1.5 text-rose-dark">✓</span>;
}

/**
 * One answer only: options joined into a single switch, so it reads
 * differently from the multiple-choice chips.
 */
const segmentClasses = (checked: boolean) =>
  `min-h-[48px] px-3 py-3 text-center text-[15px] leading-snug transition-colors ${
    checked ? "bg-rose-dark text-paper" : "bg-white/60 text-ink hover:bg-rose-tint"
  }`;

const numberInputClasses =
  "w-full rounded-md border border-hairline bg-white/60 px-4 py-3 text-[15px] text-ink placeholder:text-ink-soft/80 transition-colors focus:border-rose-dark focus:outline-none";

export function FieldRow({
  question,
  helper,
  children,
}: {
  question: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-hairline py-6 first:pt-0 last:border-b-0">
      <p className="text-[17px] text-ink">{question}</p>
      {helper && <p className="mt-1 text-[13px] text-ink-soft">{helper}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

interface Option {
  value: string;
  label: string;
}

export function MultiChipField({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(optionValue: string) {
    onChange(
      value.includes(optionValue)
        ? value.filter((v) => v !== optionValue)
        : [...value, optionValue],
    );
  }

  return (
    <div>
      <p className="mb-3 text-[13px] text-ink-soft">Puedes elegir varias.</p>
      <div className="flex flex-wrap gap-2.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value.includes(option.value)}
            onClick={() => toggle(option.value)}
            className={chipClasses(value.includes(option.value))}
          >
            {value.includes(option.value) && <Tick />}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SingleChoiceField({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string | null;
  onChange: (next: string) => void;
}) {
  if (options.length > 3) {
    return (
      <div role="radiogroup" className="flex flex-wrap gap-2.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={chipClasses(value === option.value)}
          >
            {value === option.value && <Tick />}
            {option.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div
      role="radiogroup"
      className="grid max-w-[440px] divide-x divide-hairline overflow-hidden rounded-md border border-hairline"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={segmentClasses(value === option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function BooleanField({
  value,
  onChange,
  yesLabel = "Sí",
  noLabel = "No",
}: {
  value: boolean | null;
  onChange: (next: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <div role="radiogroup" className="grid max-w-[440px] grid-cols-2 divide-x divide-hairline overflow-hidden rounded-md border border-hairline">
      <button
        type="button"
        role="radio"
        aria-checked={value === true}
        onClick={() => onChange(true)}
        className={segmentClasses(value === true)}
      >
        {yesLabel}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === false}
        onClick={() => onChange(false)}
        className={segmentClasses(value === false)}
      >
        {noLabel}
      </button>
    </div>
  );
}

export function NumberRangeField({
  min,
  max,
  minValue,
  maxValue,
  onChangeMin,
  onChangeMax,
  unit,
}: {
  min: number;
  max: number;
  minValue: number | null;
  maxValue: number | null;
  onChangeMin: (next: number | null) => void;
  onChangeMax: (next: number | null) => void;
  unit?: string;
}) {
  function parse(text: string): number | null {
    if (text.trim() === "") return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }

  return (
    <div className="flex max-w-[280px] items-center gap-3">
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        placeholder="Mín."
        value={minValue ?? ""}
        onChange={(e) => onChangeMin(parse(e.target.value))}
        className={numberInputClasses}
      />
      <span className="text-ink-soft">–</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        placeholder="Máx."
        value={maxValue ?? ""}
        onChange={(e) => onChangeMax(parse(e.target.value))}
        className={numberInputClasses}
      />
      {unit && <span className="text-[13px] text-ink-soft">{unit}</span>}
    </div>
  );
}
