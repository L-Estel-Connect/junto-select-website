import type { Metadata } from "next";
import SiteHeader from "@/components/salon/SiteHeader";
import EventCards from "@/components/salon/EventCards";
import { getUpcomingEvents } from "@/lib/site/events";

export const metadata: Metadata = {
  title: "Eventos para solteros en Madrid · Próximos encuentros",
  description:
    "Próximos encuentros de Junto Select: eventos exclusivos para solteros en Madrid, con plazas limitadas y en lugares con encanto. Abiertos a todos; los miembros Select reciben un código del 20 % para un encuentro al mes.",
  alternates: { canonical: "/eventos" },
};

// Published events change from the admin Events Manager: always read fresh.
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await getUpcomingEvents();
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
            Abiertos a todos; los miembros Select reciben cada mes un código del 20 % para un encuentro elegible.
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
