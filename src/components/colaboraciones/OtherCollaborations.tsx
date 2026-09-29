import Section from "../Section";
import { eyebrowClasses } from "@/lib/styles";

const categories = [
  "gastronomía",
  "vino",
  "hospitality",
  "viajes",
  "wellness",
  "belleza",
  "lifestyle",
  "cultura",
  "experiencias",
];

export default function OtherCollaborations() {
  return (
    <Section size="lg" className="border-t border-hairline py-16 sm:py-20">
      <div className="max-w-[62ch]">
        <p className={eyebrowClasses}>Formatos a medida</p>
        <p className="mt-2 font-serif text-3xl font-normal text-ink sm:text-4xl">
          ¿Tienes otra propuesta?
        </p>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">
          No todas las colaboraciones encajan en un formato único. Si tu
          marca tiene otra idea — una cata, un descubrimiento de producto, un
          regalo para la comunidad, una experiencia o una colaboración con el
          espacio — nos encantará escucharla.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          Encajamos especialmente bien con marcas de{" "}
          <span className="text-ink">{categories.join(", ")}</span> — aunque
          toda propuesta relevante para nuestra comunidad es bienvenida.
        </p>
      </div>
    </Section>
  );
}
