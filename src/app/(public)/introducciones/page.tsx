import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/salon/SiteHeader";
import { EVENT_BENEFIT } from "@/lib/site/content";
import salonPhoto from "../../../../public/images/who-you-meet.png";

export const metadata: Metadata = {
  title: "Introducciones privadas · Solteros a partir de 40 en Madrid",
  description:
    "Introducciones privadas de Junto Select: un perfil que nunca se publica, propuestas cuidadas y la decisión siempre de los dos. Con Membresía Select o con un perfil privado sin coste. Hoy, en Madrid.",
  alternates: { canonical: "/introducciones" },
};

/** Existing private Introductions app: sign-in creates the profile, then onboarding. */
const CREATE_PROFILE_HREF = "/introduction";
/** Members go straight to their profile hub after signing in. */
const MEMBER_PROFILE_HREF = "/introduction?next=/member/profile";

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
  {
    title: "Si no vives en Madrid",
    text: "Puedes crear tu perfil desde hoy. Te avisaremos cuando las introducciones lleguen a tu ciudad.",
  },
];

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

      <section className="p3-ways" aria-labelledby="ways-h">
        <div className="wrap">
          <p className="eyebrow">Dos formas de participar</p>
          <h2 id="ways-h">
            Con Membresía Select <em>o sin ella.</em>
          </h2>
          <div className="p3-cards">
            <div className="p3-card mem">
              <p className="eyebrow">Con Membresía Select</p>
              <h3>Nosotros buscamos por ti.</h3>
              <ul>
                <li className="y">
                  Podrás recibir hasta tres propuestas de introducción por ciclo mensual, según compatibilidad,
                  disponibilidad y las condiciones del servicio.
                </li>
                <li className="y">Buscamos entre todos los perfiles de Madrid, con o sin membresía.</li>
                <li className="y">La búsqueda empieza cuando tu perfil privado está completo.</li>
              </ul>
              <p className="small">Incluido en la Membresía Select, junto al {EVENT_BENEFIT.short}.</p>
              <div className="acts">
                <Link className="btn" href="/membresia">
                  Ver la Membresía Select
                </Link>
                <Link className="link" href={MEMBER_PROFILE_HREF}>
                  Ya soy miembro
                </Link>
              </div>
            </div>
            <div className="p3-card">
              <p className="eyebrow">Sin membresía</p>
              <h3>Formas parte del grupo de introducciones.</h3>
              <ul>
                <li className="y">Creas tu perfil privado, sin coste y sin compromiso.</li>
                <li className="y">
                  Podemos proponerte a un miembro Select compatible y, si los dos aceptáis, os presentamos.
                </li>
                <li className="n">La búsqueda activa queda reservada a los miembros Select.</li>
              </ul>
              <p className="small">Si más adelante te haces miembro, conservas tu perfil tal como está.</p>
              <div className="acts">
                <Link className="btn btn-tinta" href={CREATE_PROFILE_HREF}>
                  Crear mi perfil privado
                </Link>
              </div>
            </div>
          </div>
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
        </div>
      </section>
    </main>
  );
}
