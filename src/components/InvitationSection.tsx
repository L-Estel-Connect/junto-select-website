import Section from "./Section";
import InvitationForm from "./InvitationForm";
import { eyebrowClasses } from "@/lib/styles";

export default function InvitationSection() {
  return (
    <Section
      id="invitacion"
      size="lg"
      className="grid grid-cols-1 items-start gap-10 py-16 sm:py-20 lg:grid-cols-[5fr_6fr] lg:gap-16"
    >
      <div>
        <h2 className="text-2xl font-light text-ink sm:text-3xl">
          500+ people have already requested an invitation.
        </h2>
        <p className="mt-1.5 text-lg font-light italic text-ink-soft">
          Más de 500 personas ya han solicitado una invitación.
        </p>

        <div className="mt-6 max-w-[46ch] space-y-4 text-[15px] leading-relaxed text-ink-soft">
          <p>
            Nuestras veladas tienen plazas limitadas y las invitaciones se
            envían de forma privada.
          </p>
          <p>
            Déjanos tus datos para poder recibir una invitación a uno de los
            próximos encuentros Junto Select en Madrid.
          </p>
          <p className="font-medium text-ink">
            Tus datos son privados. Apuntarte a la lista no te compromete a
            asistir.
          </p>
        </div>
      </div>

      <div>
        <p className={`${eyebrowClasses} mb-5`}>
          Request an invitation · Solicitar invitación
        </p>
        <InvitationForm />
      </div>
    </Section>
  );
}
