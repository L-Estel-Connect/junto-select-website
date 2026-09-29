import Section from "../Section";
import { eyebrowClasses } from "@/lib/styles";

const deliverables = [
  "Presencia de la marca en la comunicación del encuentro",
  "Comunicación a nuestra comunidad de +600 contactos directos",
  "Hasta 3 Instagram Stories para una comunidad de ≈3.000 seguidores",
  "Mención como “Junto Select en colaboración con [Marca]”",
  "Presencia discreta y elegante de la marca durante el encuentro",
  "Posibilidad de integrar un producto, cata, regalo o activación, cuando el espacio anfitrión lo permita y apruebe",
];

export default function PartnershipOffer() {
  return (
    <Section size="lg" className="border-t border-hairline py-16 sm:py-20">
      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[5fr_6fr] lg:gap-16">
        <div>
          <p className={eyebrowClasses}>La propuesta principal</p>
          <p className="mt-2 font-serif text-3xl font-normal text-ink sm:text-4xl">
            Partner de un encuentro Junto Select
          </p>
          <p className="mt-6 font-serif text-[44px] font-normal leading-none text-ink sm:text-[52px]">
            500 €
          </p>
          <p className="mt-2 text-[15px] text-ink-soft">por evento</p>
          <p className="mt-6 max-w-[46ch] text-[14px] leading-relaxed text-ink-soft">
            La colaboración con Junto Select es independiente de cualquier
            acuerdo o consumo con el espacio anfitrión.
          </p>
        </div>

        <div>
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">
            Qué incluye
          </p>
          <ul className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink">
            {deliverables.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-rose-dark" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-[52ch] text-[13px] leading-relaxed text-ink-soft">
            Cualquier activación con alcohol, alimentos, muestra de producto
            o instalación física debe ser siempre compatible con el espacio
            anfitrión y contar con su aprobación.
          </p>
        </div>
      </div>
    </Section>
  );
}
