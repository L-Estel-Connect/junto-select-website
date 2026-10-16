"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CHANNEL_OPTIONS,
  MAX_BUSCA_LENGTH,
  OBJECTIVE_OPTIONS,
  PROGRAMME_OPTIONS,
  validateInquiry,
  type InquiryErrors,
  type InquiryPayload,
  type InquiryProgramme,
} from "@/lib/matchmaking/inquiry";
import { watchAuthState } from "@/lib/firebase/auth";
import { readProfile } from "@/lib/introduction/profile";
import { getAge } from "@/lib/introduction/age";

/**
 * "Solicitar una entrevista privada": the qualification step before a
 * consultation. Posts to /api/matchmaking/inquiry, which records the request
 * for the team (/admin/solicitudes) and emails Junto. Creates no account,
 * profile or payment. The programme is preselected from
 * `?programa=select|privado`.
 *
 * Coming from a private profile (`?desde=perfil`), the form is prefilled
 * with that signed-in person's own name, email, phone, channel, age and
 * city, so they only check them. Nothing is sent until they submit.
 */

const CHANNEL_FROM_PROFILE: Record<string, InquiryPayload["canal"]> = { whatsapp: "whatsapp", telefono: "llamada", email: "email" };

function programmeFromParam(raw: string | null): InquiryProgramme | "" {
  return raw === "select" || raw === "privado" ? raw : "";
}

type Status = "idle" | "sending" | "error" | "sent";

export default function ConsultationRequest() {
  const id = useId();
  const params = useSearchParams();
  const [data, setData] = useState<InquiryPayload>({
    nombre: "",
    apellidos: "",
    email: "",
    telefono: "",
    canal: "",
    edad: "",
    ciudad: "Madrid",
    programa: programmeFromParam(params.get("programa")),
    objetivo: "",
    edadDesde: "",
    edadHasta: "",
    busca: "",
    privacidad: false,
    website: "",
  });
  const [errors, setErrors] = useState<InquiryErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [prefilled, setPrefilled] = useState(false);

  const fromProfile = params.get("desde") === "perfil";
  useEffect(() => {
    if (!fromProfile) return;
    let done = false;
    const stop = watchAuthState((user) => {
      if (!user || done) return;
      done = true;
      void readProfile(user.uid)
        .then((p) => {
          if (!p) return;
          const bd = p.private.birthDate;
          const age = bd ? getAge(bd.toDate().toISOString().slice(0, 10)) : null;
          const canal = p.contactPreferences.preferredMethod ? CHANNEL_FROM_PROFILE[p.contactPreferences.preferredMethod] : undefined;
          // Only empty fields are filled, so nothing the person already typed is replaced.
          setData((d) => ({
            ...d,
            nombre: d.nombre || p.visible.firstName || "",
            email: d.email || user.email || "",
            telefono: d.telefono || p.contactPreferences.phone || "",
            canal: d.canal || canal || "",
            edad: d.edad || (age ? String(age) : ""),
            ciudad: d.ciudad && d.ciudad !== "Madrid" ? d.ciudad : p.visible.city || d.ciudad,
          }));
          setPrefilled(true);
        })
        .catch(() => {});
    });
    return () => stop();
  }, [fromProfile]);

  // A programme card's button changes `?programa=` without remounting.
  const fromUrl = programmeFromParam(params.get("programa"));
  const [lastUrlProgramme, setLastUrlProgramme] = useState(fromUrl);
  if (fromUrl !== lastUrlProgramme) {
    setLastUrlProgramme(fromUrl);
    if (fromUrl) setData((d) => ({ ...d, programa: fromUrl }));
  }

  const set = <K extends keyof InquiryPayload>(k: K, v: InquiryPayload[K]) => {
    setData((d) => ({ ...d, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function focusFirst(e: InquiryErrors) {
    const first = Object.keys(e)[0];
    if (first) document.getElementById(`${id}-${first}`)?.focus();
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validateInquiry(data);
    setErrors(e);
    if (Object.keys(e).length) {
      focusFirst(e);
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch("/api/matchmaking/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { errors?: InquiryErrors };
        if (body.errors) {
          setErrors(body.errors);
          focusFirst(body.errors);
        }
        setStatus("error");
        return;
      }
      setStatus("sent");
      document.getElementById("entrevista")?.scrollIntoView({ behavior: "smooth" });
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    const privado = data.programa === "privado";
    return (
      <div className="done" role="status">
        <p className="eyebrow">Solicitud recibida</p>
        <h3>Gracias, {data.nombre.trim()}.</h3>
        <p>Hemos recibido tu solicitud. La revisamos personalmente y te contestamos por el medio que has elegido.</p>
        <ol>
          <li>Una breve llamada de cualificación para conocer tu búsqueda.</li>
          <li>Si creemos que podemos ayudarte, te enviamos la propuesta y las condiciones por escrito.</li>
          <li>
            {privado
              ? "Al confirmar el programa, reservamos tus 45 minutos con la fundadora."
              : "Al confirmar el programa, empezamos a buscar."}
          </li>
        </ol>
      </div>
    );
  }

  const err = (k: keyof InquiryPayload) =>
    errors[k] ? (
      <p className="err" id={`${id}-${k}-err`}>
        {errors[k]}
      </p>
    ) : null;
  const a11y = (k: keyof InquiryPayload) => ({
    "aria-invalid": Boolean(errors[k]),
    "aria-describedby": errors[k] ? `${id}-${k}-err` : undefined,
  });

  const chips = <K extends "programa" | "objetivo" | "canal">(
    k: K,
    options: readonly { value: string; label: string }[],
  ) => (
    <div className="chips" id={`${id}-${k}`} tabIndex={-1}>
      {options.map((o) => (
        <label className="chip" key={o.value}>
          <input
            type="radio"
            name={k}
            value={o.value}
            checked={data[k] === o.value}
            onChange={() => set(k, o.value as InquiryPayload[K])}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );

  const text = (k: "nombre" | "apellidos" | "email" | "telefono" | "ciudad", label: string, extra: object = {}) => (
    <div className="field">
      <label htmlFor={`${id}-${k}`}>{label}</label>
      <input
        id={`${id}-${k}`}
        className="input"
        value={data[k]}
        onChange={(e) => set(k, e.target.value)}
        {...a11y(k)}
        {...extra}
      />
      {err(k)}
    </div>
  );

  const age = (k: "edad" | "edadDesde" | "edadHasta", label: string, visibleLabel = true) => (
    <input
      id={`${id}-${k}`}
      className="input"
      inputMode="numeric"
      maxLength={2}
      aria-label={visibleLabel ? undefined : label}
      value={data[k]}
      onChange={(e) => set(k, e.target.value.replace(/\D/g, ""))}
      {...a11y(k)}
    />
  );

  return (
    <form className="fform" onSubmit={submit} noValidate aria-label="Solicitar una entrevista privada">
      {prefilled && (
        <p className="note-sm" role="status">
          Hemos completado algunos datos con tu perfil. Revísalos antes de enviar.
        </p>
      )}
      <fieldset className="field">
        <legend>Programa que te interesa</legend>
        {chips("programa", PROGRAMME_OPTIONS)}
        {err("programa")}
      </fieldset>

      <div className="field-row">
        {text("nombre", "Nombre", { autoComplete: "given-name" })}
        {text("apellidos", "Apellidos", { autoComplete: "family-name" })}
      </div>

      <div className="field-row">
        {text("email", "Email", { type: "email", autoComplete: "email" })}
        {text("telefono", "Teléfono o WhatsApp", { type: "tel", autoComplete: "tel" })}
      </div>

      <fieldset className="field">
        <legend>¿Cómo prefieres que te contactemos?</legend>
        {chips("canal", CHANNEL_OPTIONS)}
        {err("canal")}
      </fieldset>

      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-edad`}>Edad</label>
          {age("edad", "Edad")}
          {err("edad")}
        </div>
        {text("ciudad", "Ciudad", { autoComplete: "address-level2" })}
      </div>

      <fieldset className="field">
        <legend>¿Qué buscas?</legend>
        {chips("objetivo", OBJECTIVE_OPTIONS)}
        {err("objetivo")}
      </fieldset>

      <fieldset className="field">
        <legend>Edad de la persona que buscas</legend>
        <div className="mm-age-range">
          {age("edadDesde", "Desde (años)", false)}
          <span>a</span>
          {age("edadHasta", "Hasta (años)", false)}
        </div>
        {err("edadDesde")}
      </fieldset>

      <div className="field">
        <label htmlFor={`${id}-busca`}>
          En pocas palabras, ¿qué es importante para ti? <span className="opt">(opcional)</span>
        </label>
        <textarea
          id={`${id}-busca`}
          className="input mm-textarea"
          rows={3}
          maxLength={MAX_BUSCA_LENGTH}
          value={data.busca}
          onChange={(e) => set("busca", e.target.value)}
          {...a11y("busca")}
        />
        {err("busca")}
      </div>

      <div className="hp" aria-hidden="true">
        <label htmlFor={`${id}-website`}>Web</label>
        <input
          id={`${id}-website`}
          tabIndex={-1}
          autoComplete="off"
          value={data.website}
          onChange={(e) => set("website", e.target.value)}
        />
      </div>

      <div className="field">
        <label className="check" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          <input
            id={`${id}-privacidad`}
            type="checkbox"
            checked={data.privacidad}
            onChange={(e) => set("privacidad", e.target.checked)}
            {...a11y("privacidad")}
          />
          <span>
            He leído la{" "}
            <Link href="/privacidad" target="_blank">
              política de privacidad
            </Link>{" "}
            y acepto que Junto Select use estos datos para gestionar mi solicitud y contactarme.
          </span>
        </label>
        {err("privacidad")}
      </div>

      <div className="mm-form-acts">
        <button type="submit" className="btn btn-tinta" disabled={status === "sending"}>
          {status === "sending" ? "Enviando…" : "Enviar mi solicitud"}
        </button>
      </div>
      {status === "error" && Object.keys(errors).length === 0 && (
        <p className="err" role="alert">
          No hemos podido enviar tu solicitud. Inténtalo de nuevo en unos minutos.
        </p>
      )}

      <p className="privacy-basic">
        <strong>Información básica sobre protección de datos.</strong> Responsable: L-Estel Connect SL. Finalidad:
        gestionar tu solicitud de matchmaking y contactarte para la entrevista. Legitimación: tu solicitud. Tus datos
        solo los ve nuestro equipo; no se publican, no crean un perfil y no se usan para enviarte publicidad.
        Destinatarios: Brevo, nuestro proveedor de envío de emails. Derechos: acceso, rectificación, supresión y los
        demás que explica nuestra{" "}
        <Link href="/privacidad" target="_blank">
          política de privacidad
        </Link>
        .
      </p>
    </form>
  );
}
