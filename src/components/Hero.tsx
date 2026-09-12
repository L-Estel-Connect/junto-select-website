import Section from "./Section";
import Wordmark from "./Wordmark";
import { eyebrowClasses, primaryButtonClasses } from "@/lib/styles";

export default function Hero() {
  return (
    <Section
      as="header"
      narrow
      className="flex min-h-[92svh] flex-col items-center justify-center gap-10 py-28 text-center"
    >
      <div className="space-y-1.5">
        <p className={eyebrowClasses}>Elegant encounters in Madrid</p>
        <p className={eyebrowClasses}>Encuentros con estilo en Madrid</p>
      </div>

      <Wordmark className="text-3xl text-ink sm:text-4xl" />

      <h1 className="max-w-[22ch] text-2xl font-light leading-snug text-ink sm:text-3xl">
        <span className="block">
          Meet someone you wouldn&rsquo;t meet anywhere else.
        </span>
        <span className="mt-4 block text-xl font-light italic text-ink-soft sm:text-2xl">
          Conoce a alguien que quizá nunca conocerías de otra manera.
        </span>
      </h1>

      <div className="max-w-[52ch] space-y-5 text-[15px] leading-relaxed text-ink-soft sm:text-base">
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
          privados con encanto y un ambiente elegante donde conocer a alguien
          vuelve a sentirse natural.
        </p>
        <p className="text-ink">
          Invitaciones limitadas. Invitados seleccionados. Posibilidades
          reales.
        </p>
      </div>

      <a href="#invitacion" className={primaryButtonClasses}>
        Join the private list · Únete a la lista privada
      </a>
    </Section>
  );
}
