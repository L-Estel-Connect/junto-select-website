import Section from "../Section";
import { eyebrowClasses } from "@/lib/styles";

const otherMetrics = [
  {
    label: "≈ 3.000",
    description: "seguidores en Instagram.",
  },
  {
    label: "+700",
    description: "contactos directos en nuestra comunidad/email.",
  },
  {
    label: "≈ 1 encuentro/mes",
    description: "físico de Junto Select en Madrid.",
  },
];

export default function WhyThisCommunity() {
  return (
    <Section size="lg" className="py-16 sm:py-20">
      <p className={eyebrowClasses}>Por qué esta comunidad</p>
      <p className="mt-2 font-serif text-3xl font-normal text-ink sm:text-4xl">
        Más que visibilidad
      </p>
      <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-ink-soft">
        No se trata solo de visibilidad: Junto Select permite a las marcas
        conectar con una comunidad muy definida a través de nuestros canales
        directos, nuestro contenido en redes y, sobre todo, encuentros
        presenciales en Madrid.
      </p>

      <div className="mt-12 grid grid-cols-1 items-start gap-10 border-t border-hairline pt-10 lg:grid-cols-[5fr_6fr] lg:gap-16">
        <div>
          <p className="font-serif text-[52px] font-normal leading-none text-ink sm:text-[64px]">
            ≈60%
          </p>
          <p className="mt-3 text-lg text-ink">
            tasa de apertura de nuestras comunicaciones.
          </p>
          <p className="mt-1.5 max-w-[42ch] text-[14px] leading-relaxed text-ink-soft">
            Una relación de email directa y activa con la comunidad —
            calidad de relación, no solo volumen de impactos.
          </p>
        </div>

        <ul className="space-y-6 lg:border-l lg:border-hairline lg:pl-16">
          {otherMetrics.map((metric) => (
            <li key={metric.label} className="flex items-baseline gap-3 text-[15px] leading-relaxed">
              <span className="font-serif text-xl font-normal text-ink">{metric.label}</span>
              <span className="text-ink-soft">{metric.description}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
