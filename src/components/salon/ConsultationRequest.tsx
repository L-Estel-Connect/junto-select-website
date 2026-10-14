"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CONSULTATION_BOOKING_URL, CONTACT_EMAIL } from "@/lib/site/content";
import { PROGRAMMES, type ProgrammeKey } from "@/lib/site/matchmaking";

/**
 * "Solicitar una entrevista privada": the short qualification step before a
 * consultation. Interim solution, approved backend pending: nothing is sent
 * to or stored by the website. Submitting prepares an email to Junto in the
 * visitor's own mail app, and the same text can be copied if no mail app
 * opens. The programme is preselected from `?programa=select|privado`.
 */

const AGES = ["Menos de 40", "40 a 49", "50 a 59", "60 o más"] as const;
const CONTACT_PREFS = ["Email", "Teléfono", "WhatsApp"] as const;
const PROGRAMME_CHOICES: { value: ProgrammeKey | "nose"; label: string }[] = [
  ...PROGRAMMES.map((p) => ({ value: p.key, label: `${p.name} · ${p.priceLabel}` })),
  { value: "nose", label: "Aún no lo sé" },
];

interface Data {
  nombre: string;
  email: string;
  telefono: string;
  contacto: (typeof CONTACT_PREFS)[number];
  edad: string;
  ciudad: string;
  programa: ProgrammeKey | "nose";
  busca: string;
}

type Errors = Partial<Record<keyof Data, string>>;

function programmeFromParam(raw: string | null): ProgrammeKey | "nose" {
  return raw === "select" || raw === "privado" ? raw : "nose";
}

function validate(d: Data): Errors {
  const e: Errors = {};
  if (!d.nombre.trim()) e.nombre = "Indícanos tu nombre.";
  if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) e.email = "Indícanos un email válido.";
  if (d.contacto !== "Email" && d.telefono.replace(/\D/g, "").length < 9)
    e.telefono = "Indícanos un teléfono para poder contactarte así.";
  return e;
}

function compose(d: Data): { subject: string; body: string } {
  const programme = PROGRAMME_CHOICES.find((p) => p.value === d.programa)?.label ?? "Aún no lo sé";
  const lines = [
    "Hola,",
    "",
    "Me gustaría solicitar una entrevista privada de matchmaking.",
    "",
    `Nombre: ${d.nombre.trim()}`,
    `Email: ${d.email.trim()}`,
    d.telefono.trim() ? `Teléfono: ${d.telefono.trim()}` : null,
    `Prefiero que me contactéis por: ${d.contacto}`,
    d.edad ? `Edad: ${d.edad}` : null,
    d.ciudad.trim() ? `Ciudad: ${d.ciudad.trim()}` : null,
    `Programa: ${programme}`,
    d.busca.trim() ? ["", "Lo que busco:", d.busca.trim()].join("\n") : null,
    "",
    "Gracias.",
  ].filter((l): l is string => l !== null);
  return { subject: `Solicitud de entrevista privada · ${d.nombre.trim()}`, body: lines.join("\n") };
}

export default function ConsultationRequest() {
  const id = useId();
  const params = useSearchParams();
  const [data, setData] = useState<Data>({
    nombre: "",
    email: "",
    telefono: "",
    contacto: "Email",
    edad: "",
    ciudad: "Madrid",
    programa: programmeFromParam(params.get("programa")),
    busca: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [sent, setSent] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // A programme card's button changes `?programa=` without remounting.
  const fromUrl = programmeFromParam(params.get("programa"));
  const [lastUrlProgramme, setLastUrlProgramme] = useState(fromUrl);
  if (fromUrl !== lastUrlProgramme) {
    setLastUrlProgramme(fromUrl);
    setData((d) => ({ ...d, programa: fromUrl }));
  }

  const set = <K extends keyof Data>(k: K, v: Data[K]) => {
    setData((d) => ({ ...d, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate(data);
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById(`${id}-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    const message = compose(data);
    setSent(message);
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`;
  }

  async function copy() {
    if (!sent) return;
    try {
      await navigator.clipboard.writeText(`${sent.subject}\n\n${sent.body}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (sent) {
    return (
      <div className="done" role="status">
        <p className="eyebrow">Tu solicitud</p>
        <h3>Solo falta enviarla.</h3>
        <p>
          Hemos preparado el mensaje en tu programa de correo. Envíalo y te escribiremos para acordar la entrevista.
        </p>
        <p>
          ¿No se ha abierto? Copia el mensaje y envíalo a{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <div className="mm-done-acts">
          <button type="button" className="btn btn-laton" onClick={copy}>
            {copied ? "Mensaje copiado" : "Copiar el mensaje"}
          </button>
          <button type="button" className="link" onClick={() => setSent(null)}>
            Volver a la solicitud
          </button>
        </div>
      </div>
    );
  }

  const err = (k: keyof Data) =>
    errors[k] ? (
      <p className="err" id={`${id}-${k}-err`}>
        {errors[k]}
      </p>
    ) : null;
  const described = (k: keyof Data) => (errors[k] ? `${id}-${k}-err` : undefined);

  return (
    <form className="fform" onSubmit={submit} noValidate aria-label="Solicitar una entrevista privada">
      <fieldset className="field">
        <legend>Programa que te interesa</legend>
        <div className="chips">
          {PROGRAMME_CHOICES.map((p) => (
            <label className="chip" key={p.value}>
              <input
                type="radio"
                name="programa"
                value={p.value}
                checked={data.programa === p.value}
                onChange={() => set("programa", p.value)}
              />
              <span>{p.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-nombre`}>Nombre</label>
          <input
            id={`${id}-nombre`}
            className="input"
            autoComplete="name"
            value={data.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            aria-invalid={!!errors.nombre}
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
            value={data.email}
            onChange={(e) => set("email", e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={described("email")}
          />
          {err("email")}
        </div>
      </div>

      <fieldset className="field">
        <legend>¿Cómo prefieres que te contactemos?</legend>
        <div className="chips">
          {CONTACT_PREFS.map((c) => (
            <label className="chip" key={c}>
              <input type="radio" name="contacto" value={c} checked={data.contacto === c} onChange={() => set("contacto", c)} />
              <span>{c}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {data.contacto !== "Email" && (
        <div className="field">
          <label htmlFor={`${id}-telefono`}>Teléfono</label>
          <input
            id={`${id}-telefono`}
            className="input"
            type="tel"
            autoComplete="tel"
            value={data.telefono}
            onChange={(e) => set("telefono", e.target.value)}
            aria-invalid={!!errors.telefono}
            aria-describedby={described("telefono")}
          />
          {err("telefono")}
        </div>
      )}

      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-edad`}>
            Edad <span className="opt">(opcional)</span>
          </label>
          <select id={`${id}-edad`} className="input" value={data.edad} onChange={(e) => set("edad", e.target.value)}>
            <option value="">Prefiero no indicarla</option>
            {AGES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-ciudad`}>Ciudad</label>
          <input
            id={`${id}-ciudad`}
            className="input"
            autoComplete="address-level2"
            value={data.ciudad}
            onChange={(e) => set("ciudad", e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor={`${id}-busca`}>
          En pocas palabras, ¿qué buscas? <span className="opt">(opcional)</span>
        </label>
        <textarea
          id={`${id}-busca`}
          className="input mm-textarea"
          rows={3}
          value={data.busca}
          onChange={(e) => set("busca", e.target.value)}
          placeholder="Una relación estable, con alguien que comparta mi forma de vivir…"
        />
      </div>

      <p className="privacy-basic">
        Al continuar se abrirá tu programa de correo con el mensaje preparado; esta web no guarda tus datos. Usaremos
        lo que nos envíes solo para responder a tu solicitud. Más información en nuestra{" "}
        <Link href="/privacidad">Política de privacidad</Link>.
      </p>

      <div className="mm-form-acts">
        <button type="submit" className="btn btn-tinta">
          Solicitar una entrevista privada
        </button>
        {CONSULTATION_BOOKING_URL && (
          <a className="link" href={CONSULTATION_BOOKING_URL} target="_blank" rel="noopener noreferrer">
            Reservar directamente una hora
          </a>
        )}
      </div>
    </form>
  );
}
