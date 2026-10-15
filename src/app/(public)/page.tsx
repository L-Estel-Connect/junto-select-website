import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/salon/SiteHeader";
import EventCards from "@/components/salon/EventCards";
import CityLinks from "@/components/salon/CityLinks";
import { FIGURES, MATCHMAKING_HREF, PRIVATE_POOL_HREF, joinHref } from "@/lib/site/content";
import { getUpcomingEvents } from "@/lib/site/events";
import heroPhoto from "../../../public/images/hero.png";
import clubPhoto from "../../../public/images/who-you-meet.png";
import selectPhoto from "../../../public/images/champagne-toast.jpg";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Junto Select",
  url: "https://juntoselect.com",
  description:
    "Club social privado para solteros a partir de 40: encuentros con plazas limitadas, experiencias cuidadosamente elegidas y un servicio de matchmaking privado. En Madrid y, próximamente, en Valencia, Barcelona y Málaga.",
  address: { "@type": "PostalAddress", addressLocality: "Madrid", addressCountry: "ES" },
};

// Upcoming events come from the admin Events Manager: always read fresh.
export const dynamic = "force-dynamic";

export default async function Home() {
  const events = (await getUpcomingEvents()).slice(0, 2);

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
          <p className="eyebrow">Club social privado · Solteros a partir de 40</p>
          <h1>
            El club privado de los solteros <em>con trayectoria.</em>
          </h1>
          <div className="hero-row">
            <p>
              Encuentros exclusivos, experiencias cuidadosamente elegidas y un servicio de matchmaking privado
              para solteros que buscan una conexión auténtica. En Madrid y, próximamente, en Valencia, Barcelona y
              Málaga.
            </p>
            <div className="hero-cta">
              <div className="hero-links">
                <Link className="btn btn-laton" href={joinHref()}>
                  Recibir invitaciones
                </Link>
                <Link className="link" href={MATCHMAKING_HREF}>
                  Descubre el matchmaking privado
                </Link>
              </div>
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
              <p className="lede">Abiertos a todos, con plazas limitadas.</p>
            </div>
            <div className="sec-links">
              <Link className="link" href="/eventos">
                Ver todos los encuentros
              </Link>
              <Link className="link" href={joinHref()}>
                Recibir invitaciones
              </Link>
            </div>
          </div>
          <EventCards events={events} />
        </div>
      </section>

      <section className="select" aria-labelledby="sel-h">
        <div className="photo">
          <Image src={selectPhoto} alt="Dos invitados brindan con champagne a la luz de las velas" fill sizes="(max-width: 1080px) 100vw, 50vw" />
        </div>
        <div className="in">
          <p className="eyebrow">Matchmaking privado</p>
          <h2 id="sel-h">
            Tú sabes lo que buscas. <em>Nosotros sabemos cómo encontrarlo.</em>
          </h2>
          <p className="txt">
            Para quienes prefieren delegar la búsqueda: una entrevista privada, candidatos seleccionados uno a uno y
            la primera cita organizada por nosotros.
          </p>
          <ul className="sel-list">
            <li><span>01</span>Una entrevista privada</li>
            <li><span>02</span>Candidatos seleccionados uno a uno</li>
            <li><span>03</span>La primera cita, organizada</li>
          </ul>
          <p className="meta">Madrid · Programas de seis meses</p>
          <Link className="link" href={MATCHMAKING_HREF} style={{ justifySelf: "start" }}>
            Descubre el matchmaking privado
          </Link>
          <p className="sel-alt">
            ¿Prefieres que te tengamos en cuenta para futuras introducciones?{" "}
            <Link href={PRIVATE_POOL_HREF}>Forma parte de nuestra red privada</Link>.
          </p>
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
              Recibir invitaciones
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
