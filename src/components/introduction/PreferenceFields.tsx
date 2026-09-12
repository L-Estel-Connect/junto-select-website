"use client";

import type { ReactNode } from "react";

const chipClasses = (checked: boolean) =>
  `rounded-full border px-5 py-3 text-[15px] transition-colors ${
    checked
      ? "border-rose-dark bg-rose-tint text-ink"
      : "border-hairline text-ink hover:border-rose"
  }`;

const numberInputClasses =
  "w-full rounded-md border border-hairline bg-paper px-4 py-3 text-[15px] text-ink placeholder:text-ink-soft/80 transition-colors focus:border-rose-dark focus:outline-none";

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
      <p className="text-[16px] text-ink">{question}</p>
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
    <div className="flex flex-wrap gap-2.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => toggle(option.value)}
          className={chipClasses(value.includes(option.value))}
        >
          {option.label}
        </button>
      ))}
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
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={chipClasses(value === option.value)}
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
    <div className="flex gap-2.5">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={chipClasses(value === true)}
      >
        {yesLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={chipClasses(value === false)}
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
