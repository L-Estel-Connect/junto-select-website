import Section from "./Section";
import { eyebrowClasses } from "@/lib/styles";

const attributes = [
  {
    word: "Con trayectoria.",
    description:
      "Personas con una vida consolidada, carrera, proyectos e intereses propios.",
  },
  {
    word: "Cosmopolitas.",
    description: "Abiertas, cultas y cómodas en un entorno internacional.",
  },
  {
    word: "Elegantes.",
    description:
      "No por las marcas ni por el estatus, sino por su presencia, seguridad y forma de tratar a los demás.",
  },
  {
    word: "Disponibles.",
    description: "Personas solteras realmente abiertas a conocer a alguien.",
  },
  {
    word: "Con intención.",
    description:
      "Porque ser selectivo no significa renunciar al amor. Significa elegir mejor dónde buscarlo.",
  },
];

export default function WhoYouMeet() {
  return (
    <Section id="quienes" className="py-24 sm:py-32">
      <div className="text-center">
        <h2 className={eyebrowClasses}>Who you&rsquo;ll meet</h2>
        <p className="mt-3 text-2xl font-light text-ink sm:text-3xl">
          Una lista de invitados diferente
        </p>
        <p className="mx-auto mt-8 max-w-[56ch] text-[15px] leading-relaxed text-ink-soft sm:text-base">
          Junto Select está pensado para personas que ya han construido una
          vida que les gusta — y que ahora quieren conocer a alguien con
          quien merezca la pena compartirla.
        </p>
      </div>

      <dl className="mt-16 divide-y divide-hairline border-t border-hairline">
        {attributes.map((item) => (
          <div
            key={item.word}
            className="grid grid-cols-1 gap-2 py-7 sm:grid-cols-[220px_1fr] sm:gap-10"
          >
            <dt className="text-lg font-normal text-ink sm:text-xl">
              {item.word}
            </dt>
            <dd className="text-[15px] leading-relaxed text-ink-soft sm:text-base">
              {item.description}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
