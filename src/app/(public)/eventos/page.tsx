import type { Metadata } from "next";
import SiteHeader from "@/components/salon/SiteHeader";
import EventCards from "@/components/salon/EventCards";
import { getUpcomingEvents } from "@/lib/site/events";

export const metadata: Metadata = {
  title: "Eventos para solteros en Madrid · Próximos encuentros",
  description:
    "Próximos encuentros de Junto Select: eventos exclusivos para solteros en Madrid, con plazas limitadas y en lugares con encanto. Abiertos a todos; privilegio mensual para miembros Select.",
  alternates: { canonical: "/eventos" },
};

export default function EventsPage() {
  const events = getUpcomingEvents();
  return (
    <main>
      <SiteHeader variant="solid" />
      <section className="page-intro">
        <div className="wrap">
          <p className="eyebrow">Encuentros · Madrid</p>
          <h1>
            Próximos <em>encuentros.</em>
          </h1>
          <p className="txt">
            Eventos para solteros con plazas limitadas, en algunos de los lugares más especiales de Madrid.
            Abiertos a todos; los miembros Select disfrutan de su privilegio mensual.
          </p>
        </div>
      </section>
      <section className="events">
        <div className="wrap">
          <EventCards events={events} />
        </div>
      </section>
    </main>
  );
}
