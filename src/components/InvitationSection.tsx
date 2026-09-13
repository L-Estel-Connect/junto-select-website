import Link from "next/link";
import Section from "./Section";
import InvitationForm from "./InvitationForm";
import { eyebrowClasses } from "@/lib/styles";

function MembershipOffer() {
  return (
    <div className="mt-8 max-w-[46ch] border-t border-hairline pt-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
        Membresía Junto Select
      </p>
      <h3 className="mt-2 font-serif text-[19px] font-normal leading-snug text-ink sm:text-[20px]">
        ¿Prefieres que busquemos por ti?
      </h3>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        Hazte miembro de Junto Select y recibe una selección privada de
        perfiles compatibles, sin swiping ni catálogos.
      </p>
      <ul className="mt-4 space-y-1.5 text-[13px] leading-relaxed text-ink">
        <li className="flex gap-2.5">
          <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-soft" />
          <span>Hasta 3 perfiles seleccionados al mes</span>
        </li>
        <li className="flex gap-2.5">
          <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-soft" />
          <span>Descuentos y ventajas en eventos Junto Select</span>
        </li>
        <li className="flex gap-2.5">
          <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-soft" />
          <span>Selección personalizada y privada</span>
        </li>
      </ul>
      <Link
        href="/introduction"
        className="mt-5 inline-flex rounded-full border border-ink px-6 py-2.5 text-center text-[12px] font-medium uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink hover:text-white"
      >
        Hazte miembro
      </Link>
      <p className="mt-3 text-[12px] text-ink-soft">
        Desde 49 € · Cancela la renovación cuando quieras.
      </p>
    </div>
  );
}

export default function InvitationSection() {
  return (
    <Section id="invitacion" size="lg" className="py-16 sm:py-20">
      <p className={`${eyebrowClasses} mb-8`}>
        Request an invitation · Solicitar invitación
      </p>

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[5fr_6fr] lg:gap-16">
        <div>
          <p className="font-serif text-[52px] font-normal leading-none text-ink sm:text-[64px]">
            500+
          </p>
          <p className="mt-3 text-lg text-ink">
            people have already requested an invitation.
          </p>
          <p className="mt-1.5 text-lg italic font-light text-ink-soft">
            Más de 500 personas ya han solicitado una invitación.
          </p>

          <div className="mt-6 max-w-[46ch] space-y-4 text-[15px] leading-relaxed text-ink-soft">
            <p>
              Nuestras veladas tienen plazas limitadas y las invitaciones se
              envían de forma privada.
            </p>
            <p>
              Déjanos tus datos para poder recibir una invitación a uno de
              los próximos encuentros Junto Select en Madrid.
            </p>
            <p className="font-medium text-ink">
              Tus datos son privados. Apuntarte a la lista no te compromete a
              asistir.
            </p>
          </div>

          <MembershipOffer />
        </div>

        <InvitationForm />
      </div>
    </Section>
  );
}
