import Section from "@/components/Section";
import Wordmark from "@/components/Wordmark";

export const metadata = { title: "Privacidad" };

export default function PrivacidadPage() {
  return (
    <Section
      as="main"
      size="sm"
      className="flex min-h-[60svh] flex-col items-center justify-center gap-6 py-16 text-center"
    >
      <Wordmark className="text-lg text-ink-soft" />
      <h1 className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Política de privacidad
      </h1>
      <p className="max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
        Estamos preparando esta página. Mientras tanto, puedes escribirnos si
        tienes alguna pregunta sobre cómo tratamos tu información.
      </p>
    </Section>
  );
}
