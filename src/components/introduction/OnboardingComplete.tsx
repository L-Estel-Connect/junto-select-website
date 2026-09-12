import Wordmark from "@/components/Wordmark";

export default function OnboardingComplete() {
  return (
    <div className="mx-auto flex min-h-[70svh] w-full max-w-[520px] flex-col items-center justify-center px-6 py-10 text-center sm:px-0">
      <Wordmark className="text-lg text-ink-soft" />
      <h1 className="mt-8 font-serif text-[28px] font-normal leading-snug text-ink sm:text-3xl">
        Gracias. Hemos guardado tu información.
      </h1>
      <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
        Pronto añadiremos el resto de tu perfil de Junto Select. Te
        avisaremos en cuanto puedas continuar.
      </p>
    </div>
  );
}
