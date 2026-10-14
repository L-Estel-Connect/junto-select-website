import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import SiteHeader from "@/components/salon/SiteHeader";
import ConsultationRequest from "@/components/salon/ConsultationRequest";
import { getAppBaseUrl } from "@/lib/config/appBaseUrl";
import { CONSULTATION_HREF, FIGURES, PRIVATE_POOL_HREF } from "@/lib/site/content";
import { BOTH_PROGRAMMES, DISCRETION, FAQ, PROGRAMMES, STEPS } from "@/lib/site/matchmaking";
import heroPhoto from "../../../../public/images/candlelit-lounge-table.jpg";
import portraitPhoto from "../../../../public/images/guest-portrait-candlelight.jpg";
import poolPhoto from "../../../../public/images/conversation-champagne.jpg";

export const metadata: Metadata = {
  title: "Matchmaking privado en Madrid para profesionales",
  description:
    "Matchmaking privado en Madrid para profesionales que buscan una relación estable sin perder tiempo en aplicaciones. Entrevista personal, candidatos seleccionados a mano y la primera cita organizada. Programas de seis meses.",
  alternates: { canonical: "/matchmaking" },
  openGraph: {
    title: "Matchmaking privado en Madrid · Junto Select",
    description: "Tú sabes lo que buscas. Nosotros sabemos cómo encontrarlo.",
    url: "/matchmaking",
  },
};

function structuredData() {
  const base = getAppBaseUrl();
  return [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: "Matchmaking privado Junto Select",
      serviceType: "Matchmaking",
      url: `${base}/matchmaking`,
      areaServed: { "@type": "City", name: "Madrid" },
      provider: { "@type": "Organization", name: "Junto Select", url: base },
      offers: PROGRAMMES.map((p) => ({
        "@type": "Offer",
        name: p.name,
        description: p.promise,
        price: p.priceEuros,
        priceCurrency: "EUR",
        priceSpecification: {
          "@type": "PriceSpecification",
          price: p.priceEuros,
          priceCurrency: "EUR",
          valueAddedTaxIncluded: true,
        },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
}

export default function MatchmakingPage() {
  return (
    <main className="mm-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }} />
      <SiteHeader cta={{ href: CONSULTATION_HREF, label: "Solicitar entrevista" }} />

      {/* 1. Hero: the promise, the signature line and one clear next step. */}
      <section className="hero mm-hero" aria-labelledby="mm-h">
        <div className="ph">
          <Image
            src={heroPhoto}
            alt="Una mesa reservada a la luz de las velas en un salón de Madrid"
            fill
            priority
            sizes="100vw"
          />
        </div>
        <div className="wrap">
          <h1 id="mm-h">
            <span className="eyebrow">Matchmaking privado en Madrid</span>
            Tú sabes lo que buscas. <em>Nosotros sabemos cómo encontrarlo.</em>
          </h1>
          <div className="hero-row">
            <p>
              Para profesionales que ya han construido su vida y prefieren no pasarla buscando. Nos cuentas qué
              buscas; nosotros nos ocupamos del resto, con discreción y criterio.
            </p>
            <div className="hero-cta">
              <div className="hero-links">
                <Link className="btn btn-laton" href={CONSULTATION_HREF}>
                  Solicitar una entrevista privada
                </Link>
                <a className="link" href="#programas">
                  Ver los dos programas
                </a>
              </div>
              <small>Madrid · Programas de seis meses</small>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Who it is for: the emotional promise, in their words. */}
      <section className="mm-for" aria-labelledby="for-h">
        <div className="wrap">
          <div className="t">
            <p className="eyebrow">Para quién</p>
            <h2 id="for-h">
              No necesitas conocer a más personas. <em>Necesitas conocer a las adecuadas.</em>
            </h2>
            <p className="txt">
              Has construido una carrera, un hogar y una vida con criterio. Sabes lo que quieres y lo que ya no. Lo
              que no tienes es tiempo para pasar las noches recorriendo perfiles, ni ganas de exponer tu vida privada
              en una aplicación.
            </p>
            <ul className="mm-contrast">
              <li>
                <b>Sin aplicaciones</b>
                <span>Ni perfiles públicos, ni horas deslizando el dedo.</span>
              </li>
              <li>
                <b>Sin perder tiempo</b>
                <span>La búsqueda la hacemos nosotros; tú decides a quién conocer.</span>
              </li>
              <li>
                <b>Sin citas a ciegas</b>
                <span>Cada propuesta llega explicada, con el interés de la otra persona confirmado.</span>
              </li>
            </ul>
          </div>
          <div className="photo">
            <Image src={portraitPhoto} alt="Una invitada sonríe en una cena a la luz de las velas" fill sizes="(max-width: 1080px) 100vw, 45vw" />
          </div>
        </div>
      </section>

      {/* 3. How it works: five steps, ending in a real meeting. */}
      <section className="mm-how" aria-labelledby="how-h">
        <div className="wrap">
          <p className="eyebrow">Cómo funciona</p>
          <h2 id="how-h">
            Nuestro objetivo no es enviarte perfiles. <em>Es que conozcas a alguien.</em>
          </h2>
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

      {/* 4. The two programmes: one sentence each says the difference. */}
      <section className="mm-progs" id="programas" aria-labelledby="pr-h">
        <div className="wrap">
          <p className="eyebrow">Dos programas</p>
          <h2 id="pr-h">
            Elige cómo quieres <em>que busquemos.</em>
          </h2>
          <div className="mm-cards">
            {PROGRAMMES.map((p) => (
              <article className={`mm-card${p.key === "privado" ? " dark" : ""}`} key={p.key} aria-labelledby={`pg-${p.key}`}>
                <header>
                  <h3 id={`pg-${p.key}`}>{p.name}</h3>
                  <p className="promise">{p.promise}</p>
                  <p className="price">
                    {p.priceLabel}
                    <span>IVA incluido · {p.duration}</span>
                  </p>
                </header>
                <dl className="p3-rows">
                  {p.rows.map((r) => (
                    <div key={r.label}>
                      <dt>{r.label}</dt>
                      <dd>{r.text}</dd>
                    </div>
                  ))}
                </dl>
                <Link className={p.key === "privado" ? "btn btn-laton" : "btn btn-tinta"} href={`?programa=${p.key}#entrevista`} scroll={false}>
                  {p.cta}
                </Link>
              </article>
            ))}
          </div>
          <div className="mm-both">
            <h3>En los dos programas</h3>
            <ul>
              {BOTH_PROGRAMMES.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <p className="note-sm">
              Antes de contratar, recibes por escrito las condiciones completas del programa. Ningún encuentro se
              organiza sin el interés de las dos personas.
            </p>
          </div>
        </div>
      </section>

      {/* 5. The human element: technology proposes, people decide. */}
      <section className="mm-human" aria-labelledby="hu-h">
        <div className="wrap">
          <div>
            <p className="eyebrow">Criterio humano</p>
            <h2 id="hu-h">
              La tecnología propone. <em>Las personas deciden.</em>
            </h2>
          </div>
          <div className="t">
            <p className="txt">
              Nuestra tecnología de compatibilidad analiza valores, estilo de vida y expectativas para encontrar
              afinidades que una búsqueda manual pasaría por alto. Pero ningún algoritmo decide por ti: cada candidato
              lo revisa y lo aprueba una persona de nuestro equipo antes de llegar a ti.
            </p>
            <p className="txt">
              Junto Select nació en Madrid como un club privado para solteros con trayectoria. En Select Privado, es
              su fundadora, Lara Estelle, quien te entrevista, diseña la búsqueda y aprueba cada propuesta.
            </p>
            <div className="figs">
              {FIGURES.slice(0, 2).map((f) => (
                <div key={f.value}>
                  <b>{f.value}</b>
                  <span>{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. Discretion. */}
      <section className="mm-disc" aria-labelledby="di-h">
        <div className="wrap">
          <h2 id="di-h">
            Discreción, <em>por principio.</em>
          </h2>
          <ul>
            {DISCRETION.map((d) => (
              <li key={d.title}>
                <h3>{d.title}</h3>
                <p>{d.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 7. The consultation request (interim: prepares an email). */}
      <section className="form-page mm-request" id="entrevista" aria-labelledby="en-h">
        <div className="wrap form-grid">
          <div className="form-aside">
            <p className="eyebrow">El primer paso</p>
            <h2 id="en-h">
              Hablemos, <em>en privado.</em>
            </h2>
            <p className="txt">
              Cuéntanos en pocas líneas qué buscas y te escribiremos para acordar una entrevista: de 20 a 30 minutos
              para el Programa Select, 45 minutos con la fundadora para Select Privado.
            </p>
            <p className="note">
              La entrevista sirve para conocernos y saber si podemos ayudarte de verdad. Solo aceptamos las búsquedas
              en las que creemos poder hacerlo.
            </p>
          </div>
          <Suspense fallback={null}>
            <ConsultationRequest />
          </Suspense>
        </div>
      </section>

      {/* 8. The free private pool: a separate, discreet invitation. */}
      <section className="mm-pool" aria-labelledby="po-h">
        <div className="photo" aria-hidden="true">
          <Image src={poolPhoto} alt="" fill sizes="(max-width: 1080px) 100vw, 50vw" />
        </div>
        <div className="in">
          <p className="eyebrow">La red privada</p>
          <h2 id="po-h">
            Forma parte de nuestra <em>red privada.</em>
          </h2>
          <p className="txt">
            ¿No buscas un programa, pero te gustaría que pensáramos en ti? Crea tu perfil privado y podremos tenerte en
            cuenta para futuras introducciones. No se publica: nadie puede buscarlo ni verlo. Si un día creemos que hay
            alguien para ti, te lo propondremos en privado, y solo seguiremos adelante si los dos queréis.
          </p>
          <p className="meta">Sin coste · Sin compromiso</p>
          <Link className="btn btn-laton" href={PRIVATE_POOL_HREF} style={{ justifySelf: "start" }}>
            Crear mi perfil privado
          </Link>
          <p className="sel-alt">
            Formar parte de la red no implica recibir una introducción. Puedes revisar, cambiar o eliminar tu perfil
            cuando quieras.
          </p>
        </div>
      </section>

      {/* 9. Questions. */}
      <section className="mm-faq" aria-labelledby="fq-h">
        <div className="wrap">
          <h2 id="fq-h">
            Preguntas <em>frecuentes.</em>
          </h2>
          <div className="list">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
          <div className="mm-faq-cta">
            <Link className="btn btn-tinta" href={CONSULTATION_HREF}>
              Solicitar una entrevista privada
            </Link>
            <small>
              ¿Prefieres empezar por el club? <Link href="/eventos">Descubre nuestros encuentros</Link>.
            </small>
          </div>
        </div>
      </section>
    </main>
  );
}
