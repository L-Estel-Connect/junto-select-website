import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/salon/SiteHeader";
import { FIGURES, MATCHMAKING_HREF, joinHref } from "@/lib/site/content";
import clubPhoto from "../../../../public/images/conversation-champagne.jpg";

export const metadata: Metadata = {
  title: "El Club · Comunidad privada de solteros",
  description:
    "Así es Junto Select: un club social privado para solteros a partir de 40. Encuentros con plazas limitadas en lugares con encanto, una comunidad que crece y un servicio de matchmaking privado.",
  alternates: { canonical: "/club" },
};

const LEVELS = [
  {
    n: "I",
    title: "La comunidad",
    text: "Recibes nuestras invitaciones a los encuentros, abiertos a todos y con plazas limitadas, y eres de los primeros en saber cuándo llegamos a tu ciudad.",
  },
  {
    n: "II",
    title: "La red privada",
    text: "Creas tu perfil privado, que nunca se publica, y podemos tenerte en cuenta para futuras introducciones. La decisión es siempre de los dos.",
  },
  {
    n: "III",
    title: "Matchmaking privado",
    text: "Para quienes prefieren delegar la búsqueda: una entrevista personal, candidatos seleccionados uno a uno y la primera cita organizada por nosotros.",
  },
];

export default function ClubPage() {
  return (
    <main>
      <SiteHeader variant="solid" />
      <section className="page-intro">
        <div className="wrap">
          <p className="eyebrow">El Club</p>
          <h1>
            Así es <em>Junto Select.</em>
          </h1>
          <p className="txt">
            Un club privado para solteros que buscan algo extraordinario: conversación de verdad, buena compañía
            y la posibilidad de conocer a alguien especial, lejos de las pantallas.
          </p>
        </div>
      </section>

      <section className="club" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="photo">
            <Image src={clubPhoto} alt="Una invitada sonríe en una conversación con una copa de champagne" fill sizes="(max-width: 1080px) 100vw, 50vw" />
          </div>
          <div className="club-txt">
            <p className="eyebrow">Para quién</p>
            <h2>
              Solteros con <em>una vida propia.</em>
            </h2>
            <p className="txt">
              Junto Select nació en Madrid para quienes han construido una trayectoria y quieren compartirla.
              Personas socialmente activas, con curiosidad y ganas de una conexión auténtica, romántica o
              simplemente humana. Nadie pasa un casting: el club atrae a quienes se reconocen en él.
            </p>
            <div className="figs">
              {FIGURES.map((f) => (
                <div key={f.value}>
                  <b>{f.value}</b>
                  <span>{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="privs" aria-labelledby="lv-h">
        <div className="wrap">
          <h2 id="lv-h">
            Tres formas de <em>formar parte.</em>
          </h2>
          <div className="priv-grid">
            {LEVELS.map((l) => (
              <article className="priv" key={l.n}>
                <span className="n">{l.n}</span>
                <h3>{l.title}</h3>
                <p>{l.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="m-cta">
        <div className="wrap">
          <h2>
            Tu lugar en <em>Junto Select.</em>
          </h2>
          <div className="acts">
            <Link className="btn btn-laton" href={joinHref()}>
              Recibir invitaciones
            </Link>
            <Link className="link" href={MATCHMAKING_HREF}>
              Descubre el matchmaking privado
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
