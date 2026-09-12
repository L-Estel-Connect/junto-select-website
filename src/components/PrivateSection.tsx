import Section from "./Section";

export default function PrivateSection() {
  return (
    <Section narrow className="py-24 text-center sm:py-32">
      <h2 className="text-2xl font-light text-ink sm:text-3xl">
        Private. Curated. Personal.
      </h2>
      <p className="mt-2 text-lg font-light italic text-ink-soft sm:text-xl">
        Privado. Seleccionado. Personal.
      </p>

      <div className="mx-auto mt-10 max-w-[52ch] space-y-5 text-[15px] leading-relaxed text-ink-soft sm:text-base">
        <p>Cada encuentro Junto Select tiene plazas limitadas.</p>
        <p>
          Seleccionamos cuidadosamente la lista de invitados buscando el
          equilibrio adecuado, elegimos espacios especiales en Madrid y
          diseñamos cada velada para que las conversaciones surjan de forma
          natural.
        </p>
        <p className="text-ink">
          No sabrás exactamente a quién vas a conocer.
          <br />
          Y ahí está parte de la magia.
        </p>
      </div>
    </Section>
  );
}
