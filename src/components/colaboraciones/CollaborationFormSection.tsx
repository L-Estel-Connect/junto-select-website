import Section from "../Section";
import CollaborationForm from "./CollaborationForm";
import { eyebrowClasses } from "@/lib/styles";

export default function CollaborationFormSection() {
  return (
    <Section id="propuesta" size="lg" className="border-t border-hairline py-16 sm:py-20">
      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[5fr_6fr] lg:gap-16">
        <div>
          <p className={eyebrowClasses}>Hablemos</p>
          <p className="mt-2 font-serif text-3xl font-normal text-ink sm:text-4xl">
            Proponer una colaboración
          </p>
          <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
            Cuéntanos sobre tu marca y qué tipo de colaboración tienes en
            mente. Respondemos personalmente a cada propuesta.
          </p>
        </div>

        <CollaborationForm />
      </div>
    </Section>
  );
}
