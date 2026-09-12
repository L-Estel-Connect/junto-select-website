import Section from "./Section";
import Photo from "./Photo";

export default function PrivateSection() {
  return (
    <Section
      size="lg"
      className="grid grid-cols-1 items-center gap-10 py-16 sm:py-20 lg:grid-cols-[5fr_5fr] lg:gap-16"
    >
      <div>
        <h2 className="text-2xl font-light text-ink sm:text-3xl">
          Private. Curated. Personal.
        </h2>
        <p className="mt-1.5 text-lg font-light italic text-ink-soft">
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

      <Photo
        ratio="aspect-[4/5] sm:aspect-[5/4] lg:aspect-[4/5]"
        label="Cena privada e íntima en Madrid por la noche"
        className="w-full lg:max-h-[520px]"
      />
    </Section>
  );
}
