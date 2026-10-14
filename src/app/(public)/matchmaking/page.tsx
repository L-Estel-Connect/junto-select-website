import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import SiteHeader from "@/components/salon/SiteHeader";
import ConsultationRequest from "@/components/salon/ConsultationRequest";
import { getAppBaseUrl } from "@/lib/config/appBaseUrl";
import { CONSULTATION_HREF, PRIVATE_POOL_HREF } from "@/lib/site/content";
import { FAQ, PROGRAMMES, STEPS } from "@/lib/site/matchmaking";
import heroPhoto from "../../../../public/images/candlelit-lounge-table.jpg";
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

      {/* 1. Hero: the promise and one clear next step. */}
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
              Para profesionales que prefieren no pasar su tiempo libre buscando. Nos cuentas qué buscas; nosotros
              buscamos, seleccionamos y te presentamos a personas que encajan contigo, sin aplicaciones y con
              discreción.
            </p>
            <div className="hero-cta">
              <div className="hero-links">
                <Link className="btn btn-laton" href={CONSULTATION_HREF}>
                  Solicitar una entrevista privada
                </Link>
                <a className="link" href="#programas">
                  Ver los programas
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. The two programmes, prices first. */}
      <section className="mm-progs" id="programas" aria-labelledby="pr-h">
        <div className="wrap">
          <p className="eyebrow">Dos programas · Seis meses</p>
          <h2 id="pr-h">
            Elige cómo quieres <em>que busquemos.</em>
          </h2>
          <div className="mm-cards">
            {PROGRAMMES.map((p) => (
              <article className={`mm-card${p.key === "privado" ? " dark" : ""}`} key={p.key} aria-labelledby={`pg-${p.key}`}>
                <header>
                  <h3 id={`pg-${p.key}`}>{p.name}</h3>
                  <p className="price">
                    {p.priceLabel}
                    <span>IVA incluido</span>
                  </p>
                  <p className="promise">{p.promise}</p>
                </header>
                <ul className="mm-incl">
                  {p.includes.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
                <p className="mm-start">{p.start}</p>
                <Link className={p.key === "privado" ? "btn btn-laton" : "btn btn-tinta"} href={`?programa=${p.key}#entrevista`} scroll={false}>
                  {p.cta}
                </Link>
              </article>
            ))}
          </div>
          <p className="note-sm mm-cond">
            Antes de contratar, recibes por escrito las condiciones completas del programa. Ninguna cita se organiza sin
            el interés de las dos personas.
          </p>
        </div>
      </section>

      {/* 3. How it works, in three steps. */}
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

      {/* 4. The private consultation: application, then booking. */}
      <section className="form-page mm-request" id="entrevista" aria-labelledby="en-h">
        <div className="wrap form-grid">
          <div className="form-aside">
            <p className="eyebrow">El primer paso</p>
            <h2 id="en-h">
              Solicita tu <em>entrevista privada.</em>
            </h2>
            <p className="txt">
              Cuéntanos quién eres y qué buscas. Revisamos cada solicitud personalmente y te contactamos para acordar
              la entrevista: de 20 a 30 minutos con nuestro equipo para el Programa Select, o una breve llamada previa
              para Select Privado.
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

      {/* 5. The private network: free, passive, separate from the programmes. */}
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
            cuenta cuando busquemos para nuestros clientes. Si un día creemos que hay alguien para ti, te lo
            propondremos en privado, y solo seguiremos adelante si los dos queréis.
          </p>
          <ul className="mm-pool-list">
            <li>Discreto: tu perfil no se publica y nadie puede buscarlo ni verlo.</li>
            <li>Sin aplicación, sin propuestas automáticas y sin suscripción.</li>
            <li>No tienes que buscar nada: nosotros te escribimos si hay alguien para ti.</li>
          </ul>
          <p className="meta">Sin coste · Sin compromiso</p>
          <Link className="btn btn-laton" href={PRIVATE_POOL_HREF} style={{ justifySelf: "start" }}>
            Crear mi perfil privado
          </Link>
          <p className="sel-alt">Puedes revisar, cambiar o eliminar tu perfil cuando quieras.</p>
        </div>
      </section>

      {/* 6. Short FAQ: the key objections only. */}
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
