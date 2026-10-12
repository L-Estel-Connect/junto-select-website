import Image from "next/image";
import Link from "next/link";
import { formatEventDate, type PublicEvent } from "@/lib/site/events";
import { joinHref } from "@/lib/site/content";
import salonPhoto from "../../../public/images/private-curated.png";

/** Event cards, or an honest "next encuentro in preparation" state when none is published. */
export default function EventCards({ events }: { events: PublicEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="empty">
        <h3>Estamos preparando el próximo encuentro.</h3>
        <p className="txt">Únete al club y te avisaremos antes que a nadie en cuanto abramos reservas.</p>
        <Link className="btn btn-tinta" href={joinHref()}>
          Únete al club
        </Link>
      </div>
    );
  }

  return (
    <div className="ev-grid">
      {events.map((e) => (
        <article className="ev" key={e.id}>
          <div className="photo">
            <Image
              src={e.coverImage ?? salonPhoto}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
            />
            {e.status === "sold_out" && <span className="badge">Completo</span>}
          </div>
          <div>
            <p className="ev-date">{formatEventDate(e.startsAt)}</p>
            <h3>{e.title}</h3>
            {e.description && <p className="ev-desc">{e.description}</p>}
          </div>
          <div className="ev-foot">
            <span>
              {e.venue}, {e.city}
              {e.priceEuros != null && ` · ${e.priceEuros} €`}
              {e.selectBenefit && " · Privilegio Select"}
            </span>
            {e.status === "sold_out" ? (
              <span>Completo</span>
            ) : (
              <a className="link" href={e.bookingUrl} target="_blank" rel="noopener noreferrer">
                Reservar
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
