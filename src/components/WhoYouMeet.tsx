import Section from "./Section";
import Photo from "./Photo";
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
    <Section
      id="quienes"
      size="lg"
      className="grid grid-cols-1 items-center gap-10 py-16 sm:py-20 lg:grid-cols-[5fr_6fr] lg:gap-16"
    >
      <Photo
        ratio="aspect-[4/5]"
        label="Cóctel íntimo y sofisticado en un salón de Madrid"
        className="w-full lg:max-h-[600px]"
      />

      <div>
        <p className={eyebrowClasses}>Who you&rsquo;ll meet</p>
        <p className="mt-2 text-2xl font-light text-ink sm:text-3xl">
          Una lista de invitados diferente
        </p>
        <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
          Junto Select está pensado para personas que ya han construido una
          vida que les gusta — y que ahora quieren conocer a alguien con
          quien merezca la pena compartirla.
        </p>

        <ul className="mt-8 space-y-4 border-t border-hairline pt-6">
          {attributes.map((item) => (
            <li key={item.word} className="text-[15px] leading-relaxed">
              <span className="font-medium text-ink">{item.word}</span>{" "}
              <span className="text-ink-soft">{item.description}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
