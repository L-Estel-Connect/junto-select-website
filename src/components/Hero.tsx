import Image from "next/image";
import Section from "./Section";
import Wordmark from "./Wordmark";
import { eyebrowClasses, primaryButtonClasses } from "@/lib/styles";
import heroPhoto from "../../public/images/hero.png";

export default function Hero() {
  return (
    <Section
      as="header"
      size="lg"
      className="grid grid-cols-1 items-center gap-10 py-14 sm:py-16 lg:grid-cols-[6fr_5fr] lg:gap-14 lg:py-20"
    >
      <div className="flex flex-col gap-6">
        <div className="space-y-1">
          <p className={eyebrowClasses}>Elegant encounters in Madrid</p>
          <p className={eyebrowClasses}>Encuentros con estilo en Madrid</p>
        </div>

        <Wordmark className="text-2xl text-ink sm:text-3xl" />

        <h1 className="max-w-[24ch] font-serif text-[30px] font-normal leading-[1.15] text-ink sm:text-4xl lg:text-[40px]">
          <span className="block">
            Meet someone you wouldn&rsquo;t meet anywhere else.
          </span>
          <span className="mt-3 block text-xl italic font-light text-ink-soft sm:text-2xl">
            Conoce a alguien que quizá nunca conocerías de otra manera.
          </span>
        </h1>

        <div className="max-w-[48ch] space-y-3 text-[15px] leading-relaxed text-ink-soft">
          <p>
            Junto Select crea encuentros cuidadosamente seleccionados para
            solteros y solteras 40+ en Madrid.
          </p>
          <p>
            Sin deslizar perfiles. Sin eventos masivos. Sin conversaciones
            interminables que no llevan a ninguna parte.
          </p>
          <p>
            Solo una lista de invitados cuidadosamente seleccionada, espacios
            privados con encanto y un ambiente elegante donde conocer a
            alguien vuelve a sentirse natural.
          </p>
          <p className="font-medium text-ink">
            Invitaciones limitadas. Invitados seleccionados. Posibilidades
            reales.
          </p>
        </div>

        <a href="#invitacion" className={`${primaryButtonClasses} mt-2 self-start`}>
          Recibir invitaciones
        </a>
      </div>

      <div className="relative aspect-[4/5] w-full overflow-hidden lg:max-h-[640px]">
        <Image
          src={heroPhoto}
          alt="Grupo elegante conversando en una azotea de Madrid al atardecer"
          fill
          priority
          sizes="(min-width: 1024px) 45vw, 100vw"
          className="object-cover"
        />
      </div>
    </Section>
  );
}
