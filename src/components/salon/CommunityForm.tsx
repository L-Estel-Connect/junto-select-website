"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import {
  AGE_RANGES,
  emptyCommunity,
  type CommunityCity,
  type CommunityInterest,
  type CommunityPayload,
} from "@/lib/types";
import { communityLimits, validateCommunity, type CommunityErrors } from "@/lib/validation";
import { CITIES } from "@/lib/site/content";

const INTERESTS: { value: CommunityInterest; label: string }[] = [
  { value: "eventos", label: "Encuentros" },
  { value: "introducciones", label: "Introducciones privadas" },
  { value: "cenas", label: "Cenas y experiencias" },
  { value: "novedades", label: "Novedades del club" },
];

const CITY_NOTE: Record<CommunityCity, string> = {
  madrid: "Madrid es nuestra ciudad activa: aquí celebramos los encuentros y funcionan las introducciones privadas.",
  valencia: "Junto Select aún no está activo en Valencia. Únete y sé de los primeros en formar parte del club cuando lleguemos.",
  barcelona: "Junto Select aún no está activo en Barcelona. Únete y sé de los primeros en formar parte del club cuando lleguemos.",
  malaga: "Junto Select aún no está activo en Málaga. Únete y sé de los primeros en formar parte del club cuando lleguemos.",
  otra: "De momento, los encuentros y las introducciones privadas solo funcionan en Madrid. Cuéntanos tu ciudad: así sabremos dónde crecer.",
};

type Status = "idle" | "submitting" | "success" | "error";

export default function CommunityForm({ initialCity, source }: { initialCity: CommunityCity | ""; source: string }) {
  const id = useId();
  const [data, setData] = useState<CommunityPayload>({ ...emptyCommunity, ciudad: initialCity, fuente: source });
  const [errors, setErrors] = useState<CommunityErrors>({});
  const [status, setStatus] = useState<Status>("idle");

  function update<K extends keyof CommunityPayload>(key: K, value: CommunityPayload[K]) {
    setData((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function toggleInterest(value: CommunityInterest) {
    update(
      "intereses",
      data.intereses.includes(value) ? data.intereses.filter((i) => i !== value) : [...data.intereses, value],
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateCommunity(data);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0];
      document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch("/api/invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { errors?: CommunityErrors };
        if (body.errors) setErrors(body.errors);
        setStatus("error");
        return;
      }
      setStatus("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    const city = CITIES.find((c) => c.slug === data.ciudad);
    const active = data.ciudad === "madrid";
    return (
      <div className="done" role="status">
        <p className="eyebrow">Comunidad Junto Select</p>
        <h2>
          {data.genero === "mujer" ? "Bienvenida" : "Bienvenido"} al club, {data.nombre.trim().split(" ")[0]}.
        </h2>
        <p>
          {active
            ? "Ya formas parte de la comunidad Junto Select en Madrid."
            : data.ciudad === "otra"
              ? `Ya formas parte de la comunidad Junto Select. Hemos anotado ${data.ciudadOtra.trim()} para saber dónde crecer.`
              : `Ya formas parte de la comunidad Junto Select. Serás de los primeros en saber cuándo llegamos a ${city?.name}.`}{" "}
          {data.aceptaMarketing
            ? "Te escribiremos con nuestras próximas invitaciones."
            : "Como no has marcado recibir invitaciones por email, no te escribiremos; puedes volver a unirte cuando quieras para activarlas."}
        </p>
        <Link className="link" href="/membresia">
          Descubre la Membresía Select
        </Link>
      </div>
    );
  }

  const err = (k: keyof CommunityPayload) =>
    errors[k] ? (
      <p className="err" id={`${id}-${k}-err`}>
        {errors[k]}
      </p>
    ) : null;
  const described = (k: keyof CommunityPayload) => (errors[k] ? `${id}-${k}-err` : undefined);

  return (
    <form className="fform" onSubmit={onSubmit} noValidate>
      {status === "error" && (
        <p className="form-error" role="alert">
          No hemos podido completar tu registro. Revisa los campos o inténtalo de nuevo en unos minutos.
        </p>
      )}

      <div className="field">
        <label htmlFor={`${id}-nombre`}>Nombre</label>
        <input
          id={`${id}-nombre`}
          className="input"
          autoComplete="given-name"
          maxLength={communityLimits.NAME_MAX}
          value={data.nombre}
          onChange={(e) => update("nombre", e.target.value)}
          aria-invalid={Boolean(errors.nombre)}
          aria-describedby={described("nombre")}
        />
        {err("nombre")}
      </div>

      <div className="field">
        <label htmlFor={`${id}-email`}>Email</label>
        <input
          id={`${id}-email`}
          className="input"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={data.email}
          onChange={(e) => update("email", e.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={described("email")}
        />
        {err("email")}
      </div>

      <fieldset className="field">
        <legend id={`${id}-ciudad`} tabIndex={-1}>Ciudad</legend>
        <div className="chips" role="radiogroup" aria-labelledby={`${id}-ciudad`}>
          {CITIES.map((c) => (
            <label className="chip" key={c.slug}>
              <input
                type="radio"
                name="ciudad"
                value={c.slug}
                checked={data.ciudad === c.slug}
                onChange={() => update("ciudad", c.slug)}
              />
              <span>{c.slug === "otra" ? "Otra ciudad" : c.name}</span>
            </label>
          ))}
        </div>
        {err("ciudad")}
        {data.ciudad === "otra" && (
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor={`${id}-ciudadOtra`}>¿Cuál?</label>
            <input
              id={`${id}-ciudadOtra`}
              className="input"
              autoComplete="address-level2"
              maxLength={communityLimits.CITY_MAX}
              value={data.ciudadOtra}
              onChange={(e) => update("ciudadOtra", e.target.value)}
              aria-invalid={Boolean(errors.ciudadOtra)}
              aria-describedby={described("ciudadOtra")}
            />
            {err("ciudadOtra")}
          </div>
        )}
        {data.ciudad && <p className="note">{CITY_NOTE[data.ciudad]}</p>}
      </fieldset>

      <fieldset className="field">
        <legend id={`${id}-genero`} tabIndex={-1}>Soy</legend>
        <div className="chips">
          {(["mujer", "hombre"] as const).map((g) => (
            <label className="chip" key={g}>
              <input type="radio" name="genero" value={g} checked={data.genero === g} onChange={() => update("genero", g)} />
              <span>{g === "mujer" ? "Mujer" : "Hombre"}</span>
            </label>
          ))}
        </div>
        {err("genero")}
      </fieldset>

      <fieldset className="field">
        <legend id={`${id}-rangoEdad`} tabIndex={-1}>Edad</legend>
        <div className="chips">
          {AGE_RANGES.map((r) => (
            <label className="chip" key={r}>
              <input type="radio" name="rangoEdad" value={r} checked={data.rangoEdad === r} onChange={() => update("rangoEdad", r)} />
              <span>{r.replace("-", "–")}</span>
            </label>
          ))}
        </div>
        {err("rangoEdad")}
      </fieldset>

      <fieldset className="field">
        <legend>Me interesa</legend>
        <p className="hint">Elige todo lo que quieras.</p>
        <div className="chips">
          {INTERESTS.map((i) => (
            <label className="chip" key={i.value}>
              <input type="checkbox" name="intereses" value={i.value} checked={data.intereses.includes(i.value)} onChange={() => toggleInterest(i.value)} />
              <span>{i.label}</span>
            </label>
          ))}
        </div>
        {err("intereses")}
      </fieldset>

      <div className="field">
        <label className="check" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          <input
            id={`${id}-aceptaPrivacidad`}
            type="checkbox"
            checked={data.aceptaPrivacidad}
            onChange={(e) => update("aceptaPrivacidad", e.target.checked)}
            aria-invalid={Boolean(errors.aceptaPrivacidad)}
            aria-describedby={described("aceptaPrivacidad")}
          />
          <span>
            He leído y acepto la{" "}
            <Link href="/privacidad" target="_blank">
              política de privacidad
            </Link>
            .
          </span>
        </label>
        {err("aceptaPrivacidad")}
        <label className="check" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={data.aceptaMarketing}
            onChange={(e) => update("aceptaMarketing", e.target.checked)}
          />
          <span>Quiero recibir por email las invitaciones a los encuentros y las novedades del club. (Opcional)</span>
        </label>
      </div>

      <button className="btn btn-tinta" type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Enviando…" : "Únete al club"}
      </button>
      <p className="hint muted" style={{ fontSize: 13.5 }}>
        Unirte a la comunidad es sin compromiso y no crea ninguna cuenta. La Membresía Select es opcional.
      </p>
    </form>
  );
}
