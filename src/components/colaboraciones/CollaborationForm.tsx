"use client";

import { useId, useState, type FormEvent } from "react";
import { primaryButtonClasses } from "@/lib/styles";
import { collaborationLimits, validateCollaboration } from "@/lib/collaborations/validation";
import { collaborationTypeOptions, emptyCollaboration, type CollaborationPayload } from "@/lib/collaborations/types";

type Status = "idle" | "submitting" | "success" | "error";

const inputClasses =
  "w-full rounded-md border border-hairline bg-paper px-4 py-3 text-[15px] text-ink placeholder:text-ink-soft/80 transition-colors focus:border-rose-dark focus:outline-none";

const labelClasses = "text-sm font-medium text-ink";
const errorClasses = "text-sm text-[#8a3b3b]";

export default function CollaborationForm() {
  const [data, setData] = useState<CollaborationPayload>(emptyCollaboration);
  const [errors, setErrors] = useState<ReturnType<typeof validateCollaboration>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const formId = useId();

  function update<K extends keyof CollaborationPayload>(key: K, value: CollaborationPayload[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Prevent accidental double-submit (e.g. an eager double-click) —
    // the button is also disabled below while submitting.
    if (status === "submitting") return;

    const validationErrors = validateCollaboration(data);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setStatus("submitting");
    setSubmitError(null);

    try {
      const response = await fetch("/api/colaboraciones", {
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
      setSubmitError("No hemos podido enviar tu propuesta. Inténtalo de nuevo en unos minutos.");
    }
  }

  if (status === "success") {
    return (
      <div role="status" className="rounded-lg border border-hairline bg-white px-6 py-12 text-center sm:px-10">
        <p className="text-lg text-ink">
          Gracias. Hemos recibido tu propuesta y nos pondremos en contacto contigo.
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
          maxLength={collaborationLimits.NAME_MAX}
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

      <div className="space-y-2">
        <label htmlFor={`${formId}-marca`} className={labelClasses}>
          Marca / Empresa
        </label>
        <input
          id={`${formId}-marca`}
          name="marca"
          type="text"
          autoComplete="organization"
          required
          maxLength={collaborationLimits.BRAND_MAX}
          value={data.marca}
          onChange={(e) => update("marca", e.target.value)}
          aria-invalid={Boolean(errors.marca)}
          aria-describedby={errors.marca ? `${formId}-marca-error` : undefined}
          className={inputClasses}
        />
        {errors.marca && (
          <p id={`${formId}-marca-error`} className={errorClasses}>
            {errors.marca}
          </p>
        )}
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
        <label htmlFor={`${formId}-instagram`} className={labelClasses}>
          Instagram o web <span className="font-normal text-ink-soft">(opcional)</span>
        </label>
        <input
          id={`${formId}-instagram`}
          name="instagramOWeb"
          type="text"
          placeholder="@tumarca o https://tumarca.com"
          maxLength={collaborationLimits.HANDLE_MAX}
          value={data.instagramOWeb}
          onChange={(e) => update("instagramOWeb", e.target.value)}
          aria-invalid={Boolean(errors.instagramOWeb)}
          aria-describedby={errors.instagramOWeb ? `${formId}-instagram-error` : undefined}
          className={inputClasses}
        />
        {errors.instagramOWeb && (
          <p id={`${formId}-instagram-error`} className={errorClasses}>
            {errors.instagramOWeb}
          </p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className={labelClasses}>Tipo de colaboración</legend>
        <div
          role="radiogroup"
          aria-describedby={errors.tipoColaboracion ? `${formId}-tipo-error` : undefined}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {collaborationTypeOptions.map((option) => {
            const checked = data.tipoColaboracion === option.value;
            return (
              <label
                key={option.value}
                className={`cursor-pointer rounded-md border px-4 py-3 text-[14px] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-rose-dark ${
                  checked ? "border-rose-dark bg-rose-tint text-ink" : "border-hairline text-ink-soft hover:border-rose"
                }`}
              >
                <input
                  type="radio"
                  name="tipoColaboracion"
                  value={option.value}
                  checked={checked}
                  onChange={() => update("tipoColaboracion", option.value)}
                  className="sr-only"
                  required
                />
                {option.label}
              </label>
            );
          })}
        </div>
        {errors.tipoColaboracion && (
          <p id={`${formId}-tipo-error`} className={errorClasses}>
            {errors.tipoColaboracion}
          </p>
        )}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor={`${formId}-mensaje`} className={labelClasses}>
          Mensaje
        </label>
        <textarea
          id={`${formId}-mensaje`}
          name="mensaje"
          rows={5}
          required
          maxLength={collaborationLimits.MESSAGE_MAX}
          placeholder="Cuéntanos brevemente tu propuesta de colaboración."
          value={data.mensaje}
          onChange={(e) => update("mensaje", e.target.value)}
          aria-invalid={Boolean(errors.mensaje)}
          aria-describedby={errors.mensaje ? `${formId}-mensaje-error` : undefined}
          className={`${inputClasses} resize-none`}
        />
        {errors.mensaje && (
          <p id={`${formId}-mensaje-error`} className={errorClasses}>
            {errors.mensaje}
          </p>
        )}
      </div>

      {/* Honeypot — invisible and unreachable by keyboard/screen readers for
          a real visitor; any bot that blindly fills every input populates
          it, and the API route silently discards the submission. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
        <label htmlFor={`${formId}-website`}>No rellenar este campo</label>
        <input
          id={`${formId}-website`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={data.website}
          onChange={(e) => update("website", e.target.value)}
        />
      </div>

      {submitError && (
        <p role="alert" className={errorClasses}>
          {submitError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting} className={`${primaryButtonClasses} w-full`}>
        {isSubmitting ? "Enviando…" : "Proponer una colaboración"}
      </button>
    </form>
  );
}
