"use client";

import { useId, useState, type FormEvent } from "react";
import { primaryButtonClasses } from "@/lib/styles";
import { emptyInvitation, type InvitationPayload } from "@/lib/types";
import { invitationLimits, validateInvitation } from "@/lib/validation";

type Status = "idle" | "submitting" | "success" | "error";

const inputClasses =
  "w-full rounded-md border border-hairline bg-paper px-4 py-3 text-[15px] text-ink placeholder:text-ink-soft/80 transition-colors focus:border-rose-dark focus:outline-none";

const labelClasses = "text-sm font-medium text-ink";
const errorClasses = "text-sm text-[#8a3b3b]";

export default function InvitationForm() {
  const [data, setData] = useState<InvitationPayload>(emptyInvitation);
  const [errors, setErrors] = useState<
    ReturnType<typeof validateInvitation>
  >({});
  const [status, setStatus] = useState<Status>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const formId = useId();

  function update<K extends keyof InvitationPayload>(
    key: K,
    value: InvitationPayload[K],
  ) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors = validateInvitation(data);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setStatus("submitting");
    setSubmitError(null);

    try {
      const response = await fetch("/api/invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("request_failed");
      }

      setStatus("success");
    } catch {
      setStatus("error");
      setSubmitError(
        "No hemos podido enviar tu solicitud. Inténtalo de nuevo en unos minutos.",
      );
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className="rounded-lg border border-hairline bg-white px-6 py-12 text-center sm:px-10"
      >
        <p className="text-lg text-ink">Gracias. Ya formas parte de la lista de Junto Select.</p>
        <p className="mx-auto mt-3 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
          Recibirás directamente por email las invitaciones a nuestros
          próximos eventos.
        </p>
      </div>
    );
  }

  const isSubmitting = status === "submitting";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-6 rounded-lg border border-hairline bg-white p-6 sm:p-10"
    >
      <div className="space-y-2">
        <label htmlFor={`${formId}-nombre`} className={labelClasses}>
          Nombre
        </label>
        <input
          id={`${formId}-nombre`}
          name="nombre"
          type="text"
          autoComplete="name"
          required
          maxLength={invitationLimits.NAME_MAX}
          value={data.nombre}
          onChange={(e) => update("nombre", e.target.value)}
          aria-invalid={Boolean(errors.nombre)}
          aria-describedby={errors.nombre ? `${formId}-nombre-error` : undefined}
          className={inputClasses}
        />
        {errors.nombre && (
          <p id={`${formId}-nombre-error`} className={errorClasses}>
            {errors.nombre}
          </p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className={labelClasses}>Soy</legend>
        <div
          role="radiogroup"
          aria-describedby={
            errors.genero ? `${formId}-genero-error` : undefined
          }
          className="flex gap-3"
        >
          {(
            [
              { value: "mujer", label: "Mujer" },
              { value: "hombre", label: "Hombre" },
            ] as const
          ).map((option) => {
            const checked = data.genero === option.value;
            return (
              <label
                key={option.value}
                className={`flex-1 cursor-pointer rounded-md border px-4 py-3 text-center text-[15px] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-rose-dark ${
                  checked
                    ? "border-rose-dark bg-rose-tint text-ink"
                    : "border-hairline text-ink-soft hover:border-rose"
                }`}
              >
                <input
                  type="radio"
                  name="genero"
                  value={option.value}
                  checked={checked}
                  onChange={() => update("genero", option.value)}
                  className="sr-only"
                  required
                />
                {option.label}
              </label>
            );
          })}
        </div>
        {errors.genero && (
          <p id={`${formId}-genero-error`} className={errorClasses}>
            {errors.genero}
          </p>
        )}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor={`${formId}-profesion`} className={labelClasses}>
          Profesión / Cargo{" "}
          <span className="font-normal text-ink-soft">(opcional)</span>
        </label>
        <input
          id={`${formId}-profesion`}
          name="profesion"
          type="text"
          autoComplete="organization-title"
          maxLength={invitationLimits.PROFESSION_MAX}
          value={data.profesion}
          onChange={(e) => update("profesion", e.target.value)}
          className={inputClasses}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor={`${formId}-email`} className={labelClasses}>
          Email
        </label>
        <input
          id={`${formId}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={data.email}
          onChange={(e) => update("email", e.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? `${formId}-email-error` : undefined}
          className={inputClasses}
        />
        {errors.email && (
          <p id={`${formId}-email-error`} className={errorClasses}>
            {errors.email}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor={`${formId}-telefono`} className={labelClasses}>
          Teléfono <span className="font-normal text-ink-soft">(opcional)</span>
        </label>
        <input
          id={`${formId}-telefono`}
          name="telefono"
          type="tel"
          autoComplete="tel"
          maxLength={invitationLimits.PHONE_MAX}
          placeholder="+34 600 000 000"
          value={data.telefono}
          onChange={(e) => update("telefono", e.target.value)}
          className={inputClasses}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor={`${formId}-sobreTi`} className={labelClasses}>
          Cuéntanos sobre ti{" "}
          <span className="font-normal text-ink-soft">(opcional)</span>
        </label>
        <textarea
          id={`${formId}-sobreTi`}
          name="sobreTi"
          rows={4}
          maxLength={invitationLimits.ABOUT_MAX}
          value={data.sobreTi}
          onChange={(e) => update("sobreTi", e.target.value)}
          className={`${inputClasses} resize-none`}
        />
      </div>

      <div className="space-y-4 border-t border-hairline pt-6">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={data.confirmaEdad}
            onChange={(e) => update("confirmaEdad", e.target.checked)}
            required
            aria-invalid={Boolean(errors.confirmaEdad)}
            aria-describedby={
              errors.confirmaEdad ? `${formId}-edad-error` : undefined
            }
            className="mt-1 h-4 w-4 shrink-0 accent-[#9b7f7a]"
          />
          <span className="text-sm text-ink-soft">
            Confirmo que tengo 35 años o más.
          </span>
        </label>
        {errors.confirmaEdad && (
          <p id={`${formId}-edad-error`} className={errorClasses}>
            {errors.confirmaEdad}
          </p>
        )}

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={data.aceptaComunicaciones}
            onChange={(e) => update("aceptaComunicaciones", e.target.checked)}
            required
            aria-invalid={Boolean(errors.aceptaComunicaciones)}
            aria-describedby={
              errors.aceptaComunicaciones
                ? `${formId}-consent-error`
                : undefined
            }
            className="mt-1 h-4 w-4 shrink-0 accent-[#9b7f7a]"
          />
          <span className="text-sm text-ink-soft">
            Acepto recibir comunicaciones de Junto Select relacionadas con
            invitaciones y otra información de Junto Select. Puedo darme de
            baja cuando quiera.
          </span>
        </label>
        {errors.aceptaComunicaciones && (
          <p id={`${formId}-consent-error`} className={errorClasses}>
            {errors.aceptaComunicaciones}
          </p>
        )}
      </div>

      {submitError && (
        <p role="alert" className={errorClasses}>
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className={`${primaryButtonClasses} w-full`}
      >
        {isSubmitting ? "Enviando…" : "Recibir invitaciones"}
      </button>
    </form>
  );
}
