import Image from "next/image";
import Section from "./Section";
import privateCuratedPhoto from "../../public/images/private-curated.png";

export default function PrivateSection() {
  return (
    <Section
      size="lg"
      className="grid grid-cols-1 items-center gap-10 py-16 sm:py-20 lg:grid-cols-[5fr_5fr] lg:gap-16"
    >
      <div>
        <h2 className="font-serif text-3xl font-normal text-ink sm:text-4xl">
          Private. Curated. Personal.
        </h2>
        <p className="mt-1.5 text-lg italic font-light text-ink-soft">
          Privado. Seleccionado. Personal.
        </p>

        <div className="mt-6 max-w-[46ch] space-y-4 text-[15px] leading-relaxed text-ink-soft">
          <p>Cada encuentro Junto Select tiene plazas limitadas.</p>
          <p>
            Seleccionamos cuidadosamente la lista de invitados buscando el
            equilibrio adecuado, elegimos espacios especiales en Madrid y
            diseñamos cada velada para que las conversaciones surjan de forma
            natural.
          </p>
          <p className="font-medium text-ink">
            No sabrás exactamente a quién vas a conocer.
            <br />
            Y ahí está parte de la magia.
          </p>
        </div>
      </div>

      <div className="relative aspect-[4/5] w-full overflow-hidden lg:max-h-[520px]">
        <Image
          src={privateCuratedPhoto}
          alt="Momento íntimo en una cena privada en Madrid por la noche"
          fill
          sizes="(min-width: 1024px) 40vw, 100vw"
          className="object-cover"
        />
      </div>
    </Section>
  );
}
