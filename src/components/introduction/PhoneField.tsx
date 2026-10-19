"use client";

import type { Ref } from "react";
import { DIAL_CODES, OTHER_DIAL_CODE } from "@/lib/introduction/phone";

const controlClasses =
  "rounded-md border border-hairline bg-paper px-3 py-3 text-[15px] text-ink placeholder:text-ink-soft/80 transition-colors focus:border-rose-dark focus:outline-none";

/** Required phone on the finish-registration step: country code + number, one field each. */
export default function PhoneField({
  dialCode,
  number,
  invalid,
  inputRef,
  onChange,
}: {
  dialCode: string;
  number: string;
  invalid: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (next: { dialCode: string; number: string }) => void;
}) {
  const other = dialCode === OTHER_DIAL_CODE;
  return (
    <div className="text-left">
      <label htmlFor="registro-telefono" className="block text-[15px] font-medium text-ink">
        Tu teléfono <span className="text-[13px] font-normal text-ink-soft">(obligatorio)</span>
      </label>
      <p id="registro-telefono-ayuda" className="mt-1 text-[13px] leading-relaxed text-ink-soft">
        Necesario para completar tu registro. Solo lo usa el equipo de Junto Select para contactarte y nunca aparece
        en tu perfil.
      </p>
      <div className="mt-3 flex gap-2">
        <select
          aria-label="Prefijo del país"
          value={dialCode}
          onChange={(e) => onChange({ dialCode: e.target.value, number })}
          className={`${controlClasses} w-[44%] max-w-[210px] shrink-0`}
        >
          {DIAL_CODES.map((d) => (
            <option key={d.code} value={d.code}>
              {d.country} ({d.code})
            </option>
          ))}
          <option value={OTHER_DIAL_CODE}>Otro país</option>
        </select>
        <input
          ref={inputRef}
          id="registro-telefono"
          type="tel"
          inputMode="tel"
          autoComplete={other ? "tel" : "tel-national"}
          required
          aria-required="true"
          aria-invalid={invalid}
          aria-describedby="registro-telefono-ayuda"
          value={number}
          placeholder={other ? "+00 000 000 000" : "600 000 000"}
          onChange={(e) => onChange({ dialCode, number: e.target.value })}
          className={`${controlClasses} min-w-0 flex-1 ${invalid ? "border-[#8a3b3b]" : ""}`}
        />
      </div>
      {invalid && (
        <p className="mt-2 text-[13px] text-[#8a3b3b]">
          {!number.trim()
            ? "Indica tu número de teléfono."
            : other
              ? "Escribe tu número completo, empezando por + y el prefijo de tu país."
              : "Revisa tu número de teléfono."}
        </p>
      )}
    </div>
  );
}
