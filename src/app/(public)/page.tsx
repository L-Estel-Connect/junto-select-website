import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/salon/SiteHeader";
import EventCards from "@/components/salon/EventCards";
import CityLinks from "@/components/salon/CityLinks";
import { FIGURES, joinHref } from "@/lib/site/content";
import { getUpcomingEvents } from "@/lib/site/events";
import heroPhoto from "../../../public/images/hero.png";
import clubPhoto from "../../../public/images/who-you-meet.png";
import selectPhoto from "../../../public/images/private-curated.png";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Junto Select",
  url: "https://juntoselect.com",
  description:
    "Club social privado para solteros: encuentros exclusivos, experiencias cuidadosamente elegidas e introducciones privadas. En Madrid y, muy pronto, en Valencia, Barcelona y Málaga.",
  address: { "@type": "PostalAddress", addressLocality: "Madrid", addressCountry: "ES" },
};

export default function Home() {
  const events = getUpcomingEvents().slice(0, 2);

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <SiteHeader />

      <section className="hero" aria-label="Presentación">
        <div className="ph">
          <Image src={heroPhoto} alt="Invitados conversando en una azotea de Madrid al anochecer" fill priority sizes="100vw" />
        </div>
        <div className="wrap">
          <p className="eyebrow">Club social privado · Madrid</p>
          <h1>
            El club privado de los solteros <em>con trayectoria.</em>
          </h1>
          <div className="hero-row">
            <p>
              Encuentros exclusivos, experiencias cuidadosamente elegidas e introducciones privadas para
              solteros que buscan una conexión auténtica. En Madrid y, muy pronto, en Valencia, Barcelona y
              Málaga.
            </p>
            <div className="hero-cta">
              <div className="hero-links">
                <Link className="btn btn-laton" href={joinHref()}>
                  Únete al club
                </Link>
                <Link className="link" href="/membresia">
                  Descubre la Membresía Select
                </Link>
              </div>
              <small>Únete sin compromiso.</small>
            </div>
          </div>
        </div>
      </section>

      <section className="club" aria-labelledby="club-h">
        <div className="wrap">
          <div className="photo">
            <Image src={clubPhoto} alt="Invitados riendo alrededor de una mesa con velas" fill sizes="(max-width: 1080px) 100vw, 50vw" />
          </div>
          <div className="club-txt">
            <p className="eyebrow">El club</p>
            <h2 id="club-h">
              Lugares con encanto. <em>Personas con historia.</em>
            </h2>
            <p className="txt">
              Junto Select reúne a solteros que han construido una vida interesante y quieren compartirla. Nos
              encontramos en algunos de los lugares más especiales de Madrid, con plazas limitadas, buena
              conversación y el ambiente de un club privado. Aquí no se desliza el dedo: se brinda, se conversa
              y se vuelve.
            </p>
            <Link className="link" href="/club" style={{ justifySelf: "start" }}>
              Conoce el club
            </Link>
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

      <section className="events" aria-labelledby="ev-h">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <p className="eyebrow tinto-eyebrow">En Madrid</p>
              <h2 id="ev-h">Próximos encuentros</h2>
              <p className="lede">Abiertos a todos, con plazas limitadas. Los miembros Select disfrutan de su privilegio mensual.</p>
            </div>
            <Link className="link" href="/eventos">
              Ver todos los encuentros
            </Link>
          </div>
          <EventCards events={events} />
        </div>
      </section>

      <section className="select" aria-labelledby="sel-h">
        <div className="photo">
          <Image src={selectPhoto} alt="Una invitada entra en un salón iluminado con velas" fill sizes="(max-width: 1080px) 100vw, 50vw" />
        </div>
        <div className="in">
          <p className="eyebrow">Membresía Select</p>
          <h2 id="sel-h">
            Más que asistir, <em>pertenecer.</em>
          </h2>
          <p className="txt">
            Ser miembro Select es formar parte del club por completo. Introducciones privadas y discretas con
            solteros afines, un privilegio en nuestros encuentros cada mes y un lugar propio en un club que crece.
          </p>
          <ul className="sel-list">
            <li><span>01</span>Introducciones privadas</li>
            <li><span>02</span>Privilegio en los encuentros</li>
            <li><span>03</span>Discreción</li>
          </ul>
          <p className="meta">Disponible en Madrid · Desde 49 € al mes</p>
          <Link className="link" href="/membresia" style={{ justifySelf: "start" }}>
            Descubre la Membresía Select
          </Link>
        </div>
      </section>

      <section className="cities" id="ciudades" aria-labelledby="ci-h">
        <div className="wrap">
          <p className="eyebrow">De Madrid a toda España</p>
          <h2 id="ci-h">
            Un club que crece <em>ciudad a ciudad.</em>
          </h2>
          <CityLinks />
          <div className="join">
            <h3>Únete a la comunidad Junto Select.</h3>
            <p className="txt">
              Recibe nuestras invitaciones, descubre cada nuevo encuentro y sé de los primeros en saber cuándo
              llegamos a tu ciudad.
            </p>
            <Link className="btn btn-tinta" href={joinHref()}>
              Únete al club
            </Link>
            <small>Únete sin compromiso. La Membresía Select es opcional.</small>
          </div>
        </div>
      </section>
    </main>
  );
}
