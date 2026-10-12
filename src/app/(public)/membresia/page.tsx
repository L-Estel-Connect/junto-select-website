import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/salon/SiteHeader";
import { PLAN_DISPLAY, PLAN_KEYS } from "@/lib/billing/plans";
import { joinHref } from "@/lib/site/content";
import doorPhoto from "../../../../public/images/private-curated.png";
import salonPhoto from "../../../../public/images/who-you-meet.png";

export const metadata: Metadata = {
  title: "Membresía Select · Club privado para solteros",
  description:
    "Hazte miembro Select: introducciones privadas con solteros afines, un privilegio mensual en nuestros encuentros y un lugar propio en el club. Disponible en Madrid desde 49 € al mes.",
  alternates: { canonical: "/membresia" },
};

const PRIVILEGES = [
  {
    n: "I",
    title: "Introducciones privadas",
    text: "Te proponemos personas afines a lo que buscas. Solo os presentamos si los dos queréis conoceros.",
  },
  {
    n: "II",
    title: "Privilegio en los encuentros",
    text: "Cada mes, un código personal con un 20 % de descuento para uno de nuestros encuentros señalados.",
  },
  {
    n: "III",
    title: "Discreción",
    text: "Sin catálogos ni perfiles públicos. Tu perfil solo lo ven las personas a las que te proponemos.",
  },
];

const STEPS = [
  { title: "Tu perfil privado", text: "Después de hacerte miembro, nos cuentas quién eres y qué buscas. Tu perfil no se publica en ningún sitio." },
  { title: "Propuestas personales", text: "Cada mes recibes hasta tres propuestas de personas afines, elegidas según tus preferencias." },
  { title: "Decisión mutua", text: "Si alguien te interesa, se lo hacemos saber. Esa persona decide con la misma libertad." },
  { title: "La presentación", text: "Solo si los dos aceptáis, os ponemos en contacto. El resto lo decidís vosotros." },
];

const FAQ = [
  {
    q: "¿Qué diferencia hay entre unirme al club y ser miembro Select?",
    a: "Al unirte a la comunidad recibes nuestras invitaciones y novedades, sin compromiso y sin crear ninguna cuenta. Como miembro Select tienes una cuenta personal, introducciones privadas y un privilegio mensual en nuestros encuentros.",
  },
  {
    q: "¿Cómo empiezo?",
    a: "Eliges tu plan, creas tu cuenta y completas el pago. Después, desde tu área de miembro, completas tu perfil privado para activar las introducciones.",
  },
  {
    q: "¿Cuándo empiezan las introducciones?",
    a: "En cuanto tu perfil de introducciones está completo. Tu membresía empieza el día del pago, así que te recomendamos completarlo cuanto antes.",
  },
  { q: "¿Dónde está disponible?", a: "De momento, en Madrid. Las introducciones solo se hacen entre miembros de Madrid." },
  {
    q: "¿Cuántas propuestas recibiré?",
    a: "Hasta tres al mes. Algunos meses pueden ser menos: preferimos proponerte a alguien afín que completar un número.",
  },
  { q: "¿Quién ve mi perfil?", a: "Solo las personas a las que te proponemos, y nunca tus preferencias ni tus datos privados." },
  {
    q: "¿Cómo se renueva?",
    a: "Cada plan se renueva automáticamente al mismo precio y por el mismo periodo mientras tu membresía esté activa.",
  },
  {
    q: "¿Garantizáis encontrar pareja?",
    a: "No. Nadie puede prometerlo con honestidad. Te prometemos buenas propuestas, discreción y un club en el que merece la pena estar.",
  },
];

export default function MembershipPage() {
  return (
    <main>
      <SiteHeader />

      <section className="hero m" aria-label="Membresía Select">
        <div className="ph">
          <Image src={doorPhoto} alt="Una invitada entra en un salón iluminado con velas" fill priority sizes="100vw" style={{ objectPosition: "55% 35%" }} />
        </div>
        <div className="wrap">
          <p className="eyebrow">Membresía Select</p>
          <h1>
            Más que asistir, <em>pertenecer.</em>
          </h1>
          <div className="hero-row">
            <p>
              La membresía del club Junto Select: introducciones privadas con solteros afines, un privilegio cada
              mes en nuestros encuentros y un lugar propio en un club que crece.
            </p>
            <div className="hero-cta">
              <a className="btn btn-laton" href="#planes">
                Hazte miembro Select
              </a>
              <small>Disponible en Madrid · Desde 49 € al mes</small>
            </div>
          </div>
        </div>
      </section>

      <section className="m-intro">
        <div className="wrap">
          <p className="eyebrow">Qué es</p>
          <h2>Ser miembro Select.</h2>
          <p className="statement">
            La comunidad Junto Select recibe nuestras invitaciones. Los miembros Select forman parte del club por
            completo: buscamos por ellos con discreción y tienen un privilegio propio cada mes en nuestros
            encuentros.
          </p>
        </div>
      </section>

      <section className="privs" aria-labelledby="pv-h">
        <div className="wrap">
          <h2 id="pv-h">
            Tus privilegios <em>como miembro.</em>
          </h2>
          <div className="priv-grid">
            {PRIVILEGES.map((p) => (
              <article className="priv" key={p.n}>
                <span className="n">{p.n}</span>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="intro-sec" aria-labelledby="in-h">
        <div className="wrap">
          <p className="eyebrow">Introducciones privadas</p>
          <h2 id="in-h">
            Alguien afín, <em>presentado con discreción.</em>
          </h2>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <b>{i + 1}</b>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="intro-foot">
            <span>Disponible para miembros en Madrid. Las introducciones empiezan cuando tu perfil está completo.</span>
          </div>
        </div>
      </section>

      <section className="ev-priv" aria-labelledby="ep-h">
        <div className="photo">
          <Image src={salonPhoto} alt="Invitados brindando en un encuentro" fill sizes="(max-width: 1080px) 100vw, 50vw" />
        </div>
        <div className="in">
          <p className="eyebrow">En nuestros encuentros</p>
          <div className="big20">20 %</div>
          <h2 id="ep-h">Un privilegio cada mes en nuestros encuentros.</h2>
          <p className="txt">
            Mientras tu membresía esté activa, recibes cada mes un código personal con un 20 % de descuento para
            uno de los encuentros señalados. Lo encontrarás en tu área de miembro.
          </p>
          <Link className="link" href="/eventos" style={{ justifySelf: "start" }}>
            Ver próximos encuentros
          </Link>
        </div>
      </section>

      <section className="plans" id="planes" aria-labelledby="pl-h">
        <div className="wrap">
          <p className="eyebrow">Planes</p>
          <h2 id="pl-h">Elige tu membresía.</h2>
          <p className="lede">Todos los planes incluyen los mismos privilegios.</p>
          <div className="plan-grid">
            {PLAN_KEYS.map((key) => {
              const plan = PLAN_DISPLAY[key];
              return (
                <article className={`plan${plan.highlight ? " hl" : ""}`} key={key}>
                  {plan.highlight && <span className="tag">Recomendada</span>}
                  <span className="lbl">{plan.label}</span>
                  <span className="price">{plan.priceEuros} €</span>
                  <span className="eq">
                    {plan.durationMonths > 1 ? `Equivale a ${plan.perMonthEuros} € al mes` : " "}
                  </span>
                  <p className="bill">{plan.billingCopy}</p>
                  <Link className="btn" href={`/membresia/alta?plan=${key}`}>
                    Elegir este plan
                  </Link>
                </article>
              );
            })}
          </div>
          <p className="city">
            La Membresía Select está disponible en Madrid. En Valencia, Barcelona y Málaga llegará con el club;{" "}
            <Link href={joinHref()} style={{ color: "inherit" }}>
              únete
            </Link>{" "}
            y te avisaremos.
          </p>
        </div>
      </section>

      <section className="future" aria-labelledby="fu-h">
        <div className="wrap">
          <div className="box">
            <div>
              <p className="eyebrow">Lo que estamos preparando</p>
              <h2 id="fu-h">El club seguirá creciendo.</h2>
            </div>
            <div>
              <p>
                Estamos trabajando en nuevas formas de vivir el club, como cenas en grupo reducido, experiencias
                para miembros y nuevas ciudades. Te lo contaremos en cuanto existan.
              </p>
              <span className="not">Todavía no incluido en la membresía</span>
            </div>
          </div>
        </div>
      </section>

      <section className="m-cta" aria-labelledby="cta-h">
        <div className="wrap">
          <h2 id="cta-h">
            Forma parte de <em>Junto Select.</em>
          </h2>
          <div className="acts">
            <a className="btn btn-laton" href="#planes">
              Hazte miembro Select
            </a>
            <Link className="link" href={joinHref()}>
              ¿Aún no? Únete a la comunidad sin compromiso.
            </Link>
          </div>
        </div>
      </section>

      <section className="faq" aria-labelledby="fq-h">
        <div className="wrap">
          <h2 id="fq-h">Preguntas frecuentes</h2>
          <div>
            {FAQ.map((f, i) => (
              <details key={f.q} open={i === 0}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
