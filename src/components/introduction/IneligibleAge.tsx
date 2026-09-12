import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import { primaryButtonClasses } from "@/lib/styles";

export default function IneligibleAge() {
  return (
    <div className="mx-auto flex min-h-[70svh] w-full max-w-[480px] flex-col items-center justify-center px-6 py-10 text-center sm:px-0">
      <Wordmark className="text-lg text-ink-soft" />
      <h1 className="mt-8 font-serif text-[26px] font-normal leading-snug text-ink sm:text-3xl">
        Junto Select está reservado actualmente a personas de 35 años en
        adelante.
      </h1>
      <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
        Gracias por tu interés. En este momento no podemos continuar con la
        creación de tu perfil.
      </p>
      <Link href="/" className={`${primaryButtonClasses} mt-8`}>
        Volver a Junto Select
      </Link>
    </div>
  );
}
