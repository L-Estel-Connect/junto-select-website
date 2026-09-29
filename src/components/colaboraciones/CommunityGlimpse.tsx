import Image from "next/image";
import Section from "../Section";
import { eyebrowClasses } from "@/lib/styles";
import communityPhoto from "../../../public/images/who-you-meet.png";

/** Junto Select's own official Instagram account — confirmed with the founder. */
const INSTAGRAM_URL = "https://www.instagram.com/juntoselect/";

export default function CommunityGlimpse() {
  return (
    <Section size="lg" className="border-t border-hairline py-16 sm:py-20">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[5fr_6fr] lg:gap-16">
        <div className="relative aspect-[4/5] w-full overflow-hidden lg:max-h-[560px]">
          <Image
            src={communityPhoto}
            alt="Comunidad Junto Select disfrutando de un encuentro nocturno en Madrid"
            fill
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="object-cover"
          />
        </div>

        <div>
          <p className={eyebrowClasses}>La comunidad</p>
          <p className="mt-2 font-serif text-3xl font-normal text-ink sm:text-4xl">
            Descubre la comunidad Junto Select
          </p>
          <p className="mt-5 max-w-[48ch] text-[15px] leading-relaxed text-ink-soft">
            Encuentros con encanto, gente con trayectoria y un ambiente
            elegante — así es la comunidad con la que vuestra marca puede
            conectar, tanto en redes como en persona.
          </p>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex rounded-full border border-ink px-6 py-2.5 text-center text-[12px] font-medium uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink hover:text-white"
          >
            Seguir a Junto Select en Instagram
          </a>
        </div>
      </div>
    </Section>
  );
}
