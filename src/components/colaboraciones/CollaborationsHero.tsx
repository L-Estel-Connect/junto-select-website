import Image from "next/image";
import Section from "../Section";
import { eyebrowClasses, primaryButtonClasses } from "@/lib/styles";
import heroPhoto from "../../../public/images/private-curated.png";

export default function CollaborationsHero() {
  return (
    <Section
      as="header"
      size="lg"
      className="grid grid-cols-1 items-center gap-10 py-14 sm:py-16 lg:grid-cols-[6fr_5fr] lg:gap-14 lg:py-20"
    >
      <div className="flex flex-col gap-6">
        <div className="space-y-1">
          <p className={eyebrowClasses}>Colaboraciones de marca en Madrid</p>
        </div>

        <h1 className="max-w-[22ch] font-serif text-[30px] font-normal leading-[1.15] text-ink sm:text-4xl lg:text-[40px]">
          Conecta tu marca con la comunidad Junto Select
        </h1>

        <div className="max-w-[48ch] space-y-3 text-[15px] leading-relaxed text-ink-soft">
          <p>
            Junto Select organiza encuentros cuidadosamente seleccionados en
            Madrid para una comunidad definida y difícil de alcanzar a través
            de canales generalistas: personas en torno a los 50 años, con
            trayectoria propia, poder adquisitivo, vida social activa y
            afinidad con nuevas experiencias y marcas.
          </p>
          <p className="font-medium text-ink">
            Una relación directa que continúa en encuentros reales en Madrid.
          </p>
        </div>

        <a href="#propuesta" className={`${primaryButtonClasses} mt-2 self-start`}>
          Proponer una colaboración
        </a>
      </div>

      <div className="relative aspect-[4/5] w-full overflow-hidden lg:max-h-[640px]">
        <Image
          src={heroPhoto}
          alt="Encuentro Junto Select en un salón elegante de Madrid, con velas y copas de champagne"
          fill
          priority
          sizes="(min-width: 1024px) 45vw, 100vw"
          className="object-cover"
        />
      </div>
    </Section>
  );
}
