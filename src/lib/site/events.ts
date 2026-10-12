/**
 * Public encuentros shown on the homepage and /eventos.
 *
 * Phase 1: an explicit, empty list — no event is invented, and the pages
 * show their "next encuentro in preparation" state. Phase 3 replaces this
 * module with a Firestore-backed `publicEvents` collection managed from the
 * admin board; the shape below is that collection's planned public view so
 * the pages won't need to change.
 */
export type PublicEventStatus = "published" | "sold_out" | "cancelled";

export interface PublicEvent {
  id: string;
  title: string;
  city: string;
  /** ISO 8601 with offset, Madrid time. */
  startsAt: string;
  venue: string;
  description: string;
  coverImage: string | null;
  priceEuros: number | null;
  bookingUrl: string;
  status: PublicEventStatus;
  selectBenefit: boolean;
}

const EVENTS: PublicEvent[] = [];

/** Upcoming, visible events, soonest first. Past events never show as upcoming. */
export function getUpcomingEvents(now: Date = new Date()): PublicEvent[] {
  return EVENTS.filter((e) => e.status !== "cancelled" && new Date(e.startsAt) > now).sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt),
  );
}

const dateFmt = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

export function formatEventDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}
