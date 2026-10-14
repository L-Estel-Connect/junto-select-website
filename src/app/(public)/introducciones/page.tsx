import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/salon/SiteHeader";
import salonPhoto from "../../../../public/images/candlelit-lounge-table.jpg";

export const metadata: Metadata = {
  title: "Introducciones privadas · Solteros a partir de 40 en Madrid",
  description:
    "Introducciones privadas de Junto Select: un perfil que nunca se publica, propuestas cuidadas y la decisión siempre de los dos. Con búsqueda activa o con tu perfil privado. Hoy, en Madrid.",
  alternates: { canonical: "/introducciones" },
};

/** Members go straight to their profile hub after signing in. */
const MEMBER_PROFILE_HREF = "/introduction?next=/member/profile";

/**
 * "Elige tu modalidad": both cards answer the same questions, row by row,
 * so the difference between passive participation and active search reads
 * at a glance. The choice is carried through sign-in (`?modalidad=`) and
 * creates the profile with that service (see /api/account/choose).
 */
const MODES = [
  {
    key: "select",
    eyebrow: "Búsqueda activa · Membresía Select",
    title: "Nosotros buscamos por ti.",
    href: "/introduction?modalidad=activa",
    cta: "Empezar la búsqueda activa",
    rows: [
      { label: "Coste", text: "Desde 49 € al mes, con tres planes: 1, 3 o 6 meses." },
      {
        label: "Quién busca",
        text: "Buscamos activamente por ti entre todos los perfiles compatibles de Madrid.",
      },
      {
        label: "Propuestas",
        text: "Hasta tres propuestas de introducción por ciclo mensual, según compatibilidad, disponibilidad y las condiciones del servicio.",
      },
      { label: "Antes de presentaros", text: "Los dos tenéis que aceptar." },
      { label: "Empieza", text: "Cuando tu perfil privado está completo y tu membresía activa." },
      { label: "Además", text: "La membresía incluye un 20 % de descuento en un encuentro elegible por ciclo mensual." },
    ],
  },
  {
    key: "passive",
    eyebrow: "Perfil privado",
    title: "Formas parte de la red privada.",
    href: "/introduction?modalidad=pasivo",
    cta: "Crear mi perfil privado",
    rows: [
      { label: "Coste", text: "Sin coste." },
      {
        label: "Quién busca",
        text: "No hacemos una búsqueda activa para ti: podemos proponerte a un miembro Select compatible.",
      },
      { label: "Propuestas", text: "Sin búsqueda activa ni introducciones garantizadas." },
      { label: "Antes de presentaros", text: "Los dos tenéis que aceptar." },
      { label: "Empieza", text: "Cuando tu perfil privado está completo." },
      { label: "Si cambias de idea", text: "Puedes pasar a Select cuando quieras; conservas tu perfil tal como está." },
    ],
  },
] as const;

const STEPS = [
  {
    title: "Tu perfil privado",
    text: "Cuéntanos quién eres y qué buscas, y añade unas fotos. Tu perfil nunca se publica.",
  },
  {
    title: "Una propuesta cuidada",
    text: "Cuando encontramos a alguien compatible, os lo proponemos a los dos en privado.",
  },
  {
    title: "Decidís los dos",
    text: "Solo si los dos aceptáis, compartimos el contacto que cada uno ha elegido.",
  },
];

const OUTSIDE_MADRID = {
  title: "Si no vives en Madrid",
  text: "Puedes crear tu perfil desde hoy. Te avisaremos cuando las introducciones lleguen a tu ciudad.",
};

export default function IntroductionsPage() {
  return (
    <main>
      <SiteHeader />

      <section className="p3-hero" aria-labelledby="in-h">
        <div className="ph" aria-hidden="true">
          <Image src={salonPhoto} alt="" fill priority sizes="100vw" />
        </div>
        <div className="wrap">
          <p className="eyebrow">Introducciones privadas</p>
          <h1 id="in-h">
            Presentaciones privadas, <em>nunca un catálogo.</em>
          </h1>
          <div className="row">
            <p>
              Tu perfil solo lo ve la persona a la que te presentamos. Cada propuesta se prepara con cuidado, y la
              decisión es siempre de los dos.
            </p>
            <span className="city">Disponibles hoy en Madrid</span>
          </div>
        </div>
      </section>

      <section className="p3-ways" id="modalidad" aria-labelledby="ways-h">
        <div className="wrap">
          <h2 id="ways-h">
            Elige tu <em>modalidad.</em>
          </h2>
          {/* Phones show one card at a time; this CSS-only switch picks which
              (see .p3-switch in salon.css). Wider screens show both side by side. */}
          <input className="p3-switch-input" type="radio" name="modalidad" id="mod-select" aria-label="Ver búsqueda activa" defaultChecked />
          <input className="p3-switch-input" type="radio" name="modalidad" id="mod-passive" aria-label="Ver perfil privado" />
          <div className="p3-switch">
            <label htmlFor="mod-select">Búsqueda activa</label>
            <label htmlFor="mod-passive">Perfil privado</label>
          </div>
          <div className="p3-cards">
            {MODES.map((m) => (
              <div className={`p3-card${m.key === "select" ? " mem" : ""}`} key={m.key}>
                <p className="eyebrow">{m.eyebrow}</p>
                <h3>{m.title}</h3>
                <dl className="p3-rows">
                  {m.rows.map((r) => (
                    <div key={r.label}>
                      <dt>{r.label}</dt>
                      <dd>{r.text}</dd>
                    </div>
                  ))}
                </dl>
                <div className="acts">
                  <Link className={m.key === "select" ? "btn" : "btn btn-tinta"} href={m.href}>
                    {m.cta}
                  </Link>
                  {m.key === "select" && (
                    <Link className="link" href={MEMBER_PROFILE_HREF}>
                      Ya soy miembro
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="p3-already">
            ¿Ya tienes cuenta? <Link href="/introduction">Acceder</Link>
          </p>
        </div>
      </section>

      <section className="p3-how" aria-labelledby="how-h">
        <div className="wrap">
          <p className="eyebrow" id="how-h">
            Cómo funciona
          </p>
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <b>{String(i + 1).padStart(2, "0")}</b>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          <p className="p3-how-note">
            <strong>{OUTSIDE_MADRID.title}.</strong> {OUTSIDE_MADRID.text}
          </p>
        </div>
      </section>
    </main>
  );
}
