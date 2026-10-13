import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/salon/SiteHeader";
import { PLAN_DISPLAY, PLAN_KEYS } from "@/lib/billing/plans";
import { EVENT_BENEFIT, joinHref } from "@/lib/site/content";
import doorPhoto from "../../../../public/images/guest-portrait-candlelight.jpg";
import salonPhoto from "../../../../public/images/champagne-toast.jpg";

export const metadata: Metadata = {
  title: "Membresía Select · Club privado para solteros a partir de 40",
  description:
    "La Membresía Select de Junto Select: una comunidad selecta, introducciones privadas en Madrid y un 20 % de descuento en un encuentro al mes. Desde 49 € al mes.",
  alternates: { canonical: "/membresia" },
};

const PRIVILEGES = [
  {
    n: "I",
    title: "Una comunidad selecta",
    text: "Formas parte de un círculo de solteros con trayectoria que comparten encuentros, conversación y lugares especiales.",
    cond: "Hoy, en Madrid. Valencia, Barcelona y Málaga, próximamente.",
  },
  {
    n: "II",
    title: "Introducciones privadas",
    text: "Te presentamos, con discreción, a personas compatibles con lo que buscas. Cada propuesta es privada y solo seguimos adelante si los dos aceptáis.",
    cond: "Hasta tres propuestas por ciclo mensual, según compatibilidad y disponibilidad. Requiere tu perfil privado completo. Hoy, en Madrid.",
    link: { href: "/introducciones", label: "Cómo funcionan" },
  },
  {
    n: "III",
    title: "20 % de descuento en un encuentro al mes",
    text: EVENT_BENEFIT.text,
    cond: EVENT_BENEFIT.conditions,
  },
];

const PLAN_BUTTON: Record<string, string> = {
  monthly: "Elegir 1 mes",
  three_month: "Elegir 3 meses",
  six_month: "Elegir 6 meses",
};

export default function MembershipPage() {
  return (
    <main>
      <SiteHeader />

      <section className="hero m" aria-labelledby="m-h">
        <div className="ph">
          <Image
            src={doorPhoto}
            alt="Una invitada en una cena a la luz de las velas"
            fill
            priority
            sizes="100vw"
            style={{ objectPosition: "50% 30%" }}
          />
        </div>
        <div className="wrap">
          <p className="eyebrow">Membresía Select</p>
          <h1 id="m-h">
            Más que asistir, <em>pertenecer.</em>
          </h1>
          <div className="hero-row">
            <p>
              Para solteros a partir de 40: una comunidad selecta, introducciones privadas en Madrid y un 20 % de
              descuento en un encuentro al mes.
            </p>
            <div className="hero-cta">
              <a className="btn btn-laton" href="#planes">
                Ver planes y precios
              </a>
              <small>1, 3 o 6 meses · Renovación automática, cancelable cuando quieras</small>
            </div>
          </div>
        </div>
      </section>

      <section className="p2-exp" aria-labelledby="exp-h">
        <div className="wrap">
          <div className="t">
            <p className="eyebrow">El club</p>
            <h2 id="exp-h">
              Una vida hecha, <em>un círculo propio.</em>
            </h2>
            <p className="lead">
              Solteros a partir de 40 que valoran una buena conversación, los lugares con carácter y los encuentros
              con plazas limitadas.
            </p>
            <p className="txt">
              Ser miembro Select es formar parte de ese círculo durante todo el año, y no solo la noche de un
              encuentro.
            </p>
          </div>
          <div className="photo">
            <Image src={salonPhoto} alt="Dos invitados brindan con champagne a la luz de las velas" fill sizes="(max-width: 1080px) 100vw, 50vw" />
          </div>
        </div>
      </section>

      <section className="p2-privs" aria-labelledby="pv-h">
        <div className="wrap">
          <p className="eyebrow">Privilegios de miembro</p>
          <h2 id="pv-h">
            Los privilegios <em>Select.</em>
          </h2>
          <div className="p2-grid">
            {PRIVILEGES.map((p) => (
              <div key={p.n}>
                <span className="n">{p.n}</span>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
                <p className="cond">{p.cond}</p>
                {p.link && (
                  <Link className="link" href={p.link.href}>
                    {p.link.label}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="plans" id="planes" aria-labelledby="pl-h">
        <div className="wrap">
          <p className="eyebrow">Membresía Select</p>
          <h2 id="pl-h">
            Elige tu <em>membresía.</em>
          </h2>
          <p className="lede">Los mismos privilegios en los tres planes. Solo cambian la duración y el precio.</p>
          <div className="plan-grid">
            {PLAN_KEYS.map((key) => {
              const plan = PLAN_DISPLAY[key];
              return (
                <article className={`plan${plan.highlight ? " hl" : ""}`} key={key}>
                  {plan.highlight && <span className="tag">Recomendado</span>}
                  <span className="lbl">{plan.label}</span>
                  <span className="price">{plan.priceEuros} €</span>
                  <span className="eq">
                    {plan.durationMonths > 1 ? `Equivale a ${plan.perMonthEuros} € al mes` : " "}
                  </span>
                  <p className="bill">{plan.billingCopy}</p>
                  <Link className="btn" href={`/membresia/alta?plan=${key}`}>
                    {PLAN_BUTTON[key]}
                  </Link>
                </article>
              );
            })}
          </div>
          <div className="p2-fine">
            <p>
              <b>Renovación</b>Automática al final de cada periodo. Cancélala cuando quieras desde tu cuenta.
            </p>
            <p>
              <b>Pago seguro</b>Pago con tarjeta, procesado por Stripe.
            </p>
            <p>
              <b>Disponibilidad</b>Encuentros e introducciones, hoy en Madrid. Próximamente, en más ciudades.
            </p>
          </div>
        </div>
      </section>

      <section className="p2-close" aria-labelledby="cl-h">
        <div className="wrap">
          <p className="eyebrow">Junto Select</p>
          <h2 id="cl-h">
            La próxima conversación, <em>en el club.</em>
          </h2>
          <div className="acts">
            <a className="btn btn-laton" href="#planes">
              Hazte miembro
            </a>
            <small>
              ¿Prefieres empezar sin membresía? <Link href={joinHref()}>Únete al club sin compromiso</Link>.
            </small>
          </div>
        </div>
      </section>
    </main>
  );
}
