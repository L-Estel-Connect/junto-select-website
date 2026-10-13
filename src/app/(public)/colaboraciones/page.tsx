import type { Metadata } from "next";
import Image from "next/image";
import SiteHeader from "@/components/salon/SiteHeader";
import CollaborationForm from "@/components/colaboraciones/CollaborationForm";
import { INSTAGRAM_URL } from "@/lib/site/content";
import heroPhoto from "../../../../public/images/candlelit-lounge-table.jpg";
import communityPhoto from "../../../../public/images/who-you-meet.png";

const title = "Patrocinios y colaboraciones · Junto Select";
const description =
  "Conecta tu marca con Junto Select, el club privado para solteros a partir de 40 años. Patrocinios y colaboraciones en nuestros encuentros presenciales en Madrid.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/colaboraciones" },
  openGraph: { title, description },
  twitter: { title, description },
};

const METRICS = [
  { value: "≈ 60 %", label: "tasa de apertura de nuestras comunicaciones por email." },
  { value: "+700", label: "contactos directos en nuestra comunidad." },
  { value: "≈ 3.000", label: "seguidores en Instagram." },
  { value: "1 / mes", label: "encuentro presencial de Junto Select en Madrid, aproximadamente." },
];

const DELIVERABLES = [
  "Presencia de la marca en la comunicación del encuentro",
  "Comunicación a nuestra comunidad de +700 contactos directos",
  "Hasta 3 Instagram Stories para una comunidad de ≈ 3.000 seguidores",
  "Mención como “Junto Select en colaboración con [Marca]”",
  "Presencia discreta y elegante de la marca durante el encuentro",
  "Posibilidad de integrar un producto, cata, regalo o activación, cuando el espacio anfitrión lo permita y apruebe",
];

const CATEGORIES = "gastronomía, vino, hostelería, viajes, bienestar, belleza, estilo de vida, cultura y experiencias";

export default function CollaborationsPage() {
  return (
    <main className="co-page">
      <SiteHeader variant="solid" />

      <section className="club co-hero" aria-labelledby="co-h">
        <div className="wrap">
          <div className="club-txt">
            <p className="eyebrow">Patrocinios y colaboraciones</p>
            <h1 id="co-h">
              Una audiencia definida, <em>en un entorno cuidado.</em>
            </h1>
            <p className="txt">
              Junto Select es un club privado para solteros a partir de 40 años: personas con trayectoria propia,
              vida social activa y afinidad con nuevas experiencias y marcas. Hoy reunimos a la comunidad en
              encuentros presenciales en Madrid, con la ambición de llevar el club a otras ciudades de España.
            </p>
            <a className="btn btn-tinta" href="#propuesta" style={{ justifySelf: "start" }}>
              Proponer una colaboración
            </a>
          </div>
          <div className="photo">
            <Image
              src={heroPhoto}
              alt="Una mesa con velas y flores en un salón de Junto Select"
              fill
              priority
              sizes="(max-width: 1080px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>

      <section className="co-why" aria-labelledby="why-h">
        <div className="wrap">
          <p className="eyebrow">Por qué esta comunidad</p>
          <h2 id="why-h">
            Más que <em>visibilidad.</em>
          </h2>
          <p className="txt">
            Junto Select permite a las marcas conectar con una comunidad muy definida a través de nuestros canales
            directos, nuestro contenido en redes y, sobre todo, encuentros presenciales.
          </p>
          <div className="figs">
            {METRICS.map((m) => (
              <div key={m.value}>
                <b>{m.value}</b>
                <span>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="co-offer" aria-labelledby="of-h">
        <div className="wrap">
          <div>
            <p className="eyebrow">La propuesta principal</p>
            <h2 id="of-h">
              Partner de un <em>encuentro.</em>
            </h2>
            <p className="price">500 €</p>
            <p className="muted">por encuentro</p>
            <p className="note-sm">
              La colaboración con Junto Select es independiente de cualquier acuerdo o consumo con el espacio
              anfitrión.
            </p>
          </div>
          <div>
            <h3>Qué incluye</h3>
            <ul>
              {DELIVERABLES.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <p className="note-sm">
              Cualquier activación con alcohol, alimentos, muestra de producto o instalación física debe ser
              compatible con el espacio anfitrión y contar con su aprobación.
            </p>
          </div>
        </div>
      </section>

      <section className="club co-more" aria-labelledby="mo-h">
        <div className="wrap">
          <div className="photo">
            <Image
              src={communityPhoto}
              alt="La comunidad Junto Select en un encuentro nocturno en Madrid"
              fill
              sizes="(max-width: 1080px) 100vw, 50vw"
            />
          </div>
          <div className="club-txt">
            <p className="eyebrow">Formatos a medida</p>
            <h2 id="mo-h">
              ¿Tienes otra <em>propuesta?</em>
            </h2>
            <p className="txt">
              No todas las colaboraciones encajan en un formato único: una cata, un descubrimiento de producto, un
              regalo para la comunidad o una experiencia. Encajamos especialmente bien con marcas de {CATEGORIES},
              aunque toda propuesta relevante para nuestra comunidad es bienvenida.
            </p>
            <a className="link" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" style={{ justifySelf: "start" }}>
              Ver Junto Select en Instagram
            </a>
          </div>
        </div>
      </section>

      <section className="form-page co-form" id="propuesta" aria-labelledby="pr-h">
        <div className="wrap form-grid">
          <div className="form-aside">
            <p className="eyebrow">Hablemos</p>
            <h2 id="pr-h">
              Proponer una <em>colaboración.</em>
            </h2>
            <p className="txt">
              Cuéntanos sobre tu marca y qué tipo de colaboración tienes en mente. Respondemos personalmente a cada
              propuesta.
            </p>
          </div>
          <CollaborationForm />
        </div>
      </section>
    </main>
  );
}
