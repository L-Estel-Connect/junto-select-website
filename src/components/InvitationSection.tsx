import Section from "./Section";
import InvitationForm from "./InvitationForm";
import { eyebrowClasses } from "@/lib/styles";

export default function InvitationSection() {
  return (
    <Section id="invitacion" narrow className="py-24 sm:py-32">
      <div className="text-center">
        <h2 className="text-2xl font-light text-ink sm:text-3xl">
          500+ people have already requested an invitation.
        </h2>
        <p className="mt-2 text-lg font-light italic text-ink-soft sm:text-xl">
          Más de 500 personas ya han solicitado una invitación.
        </p>

        <div className="mx-auto mt-8 max-w-[50ch] space-y-4 text-[15px] leading-relaxed text-ink-soft sm:text-base">
          <p>
            Nuestras veladas tienen plazas limitadas y las invitaciones se
            envían de forma privada.
          </p>
          <p>
            Déjanos tus datos para poder recibir una invitación a uno de los
            próximos encuentros Junto Select en Madrid.
          </p>
          <p className="text-ink">
            Tus datos son privados. Apuntarte a la lista no te compromete a
            asistir.
          </p>
        </div>
      </div>

      <p className={`${eyebrowClasses} mt-14 mb-6 text-center`}>
        Request an invitation · Solicitar invitación
      </p>

      <InvitationForm />
    </Section>
  );
}
