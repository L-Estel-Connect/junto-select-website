/**
 * Pure rules (no Firebase imports) turning an event record into what the
 * public website shows. Shared by the public pages and the admin preview,
 * so what Lara previews is exactly what visitors see.
 */
import type { EligibleTicketTailorEventDocument, EventPublicStatus } from "@/lib/eventBenefits/types";

export type PublicEventStatus = "coming_soon" | "tickets_available" | "sold_out";

export interface PublicEvent {
  id: string;
  title: string;
  eventType: string | null;
  city: string;
  /** "YYYY-MM-DD", Madrid. */
  date: string;
  /** "HH:MM", Madrid, or null when not announced. */
  time: string | null;
  venue: string | null;
  description: string | null;
  coverImage: string | null;
  priceFromEuros: number | null;
  /** Only for tickets_available, and only when a real Ticket Tailor link exists. */
  bookingUrl: string | null;
  status: PublicEventStatus;
  selectBenefit: boolean;
}

const PUBLIC_STATUSES: EventPublicStatus[] = ["coming_soon", "tickets_available", "sold_out"];

export function madridToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Same rule the discount engine uses: enabled (missing counts as on, for older records) and scoped to ticket types. */
export function offersSelectBenefit(e: EligibleTicketTailorEventDocument): boolean {
  return e.memberBenefitEnabled !== false && e.ticketTailorLinked !== false && e.ticketTailorTicketTypeIds.length > 0;
}

/** The card as it would look, whether or not it is published (admin preview). Null when it can't be shown at all. */
export function toPublicEvent(e: EligibleTicketTailorEventDocument): PublicEvent | null {
  const status = e.publicStatus ?? "draft";
  if (!e.eventDate || !PUBLIC_STATUSES.includes(status)) return null;
  const s = status as PublicEventStatus;
  return {
    id: e.ticketTailorEventId,
    title: e.label,
    eventType: e.eventType?.trim() || null,
    city: e.city?.trim() || "Madrid",
    date: e.eventDate,
    time: e.startTime || null,
    venue: e.venuePublic?.trim() || null,
    description: e.description?.trim() || null,
    coverImage: e.imageUrl || null,
    priceFromEuros: typeof e.priceFromEuros === "number" ? e.priceFromEuros : null,
    bookingUrl: s === "tickets_available" && e.ticketTailorLinked !== false ? e.ticketTailorCheckoutUrl || null : null,
    status: s,
    selectBenefit: offersSelectBenefit(e),
  };
}

/** Published, not archived, not yet past: what the homepage and /eventos list, soonest first. */
export function upcomingPublicEvents(events: EligibleTicketTailorEventDocument[], now: Date = new Date()): PublicEvent[] {
  const today = madridToday(now);
  return events
    .filter((e) => e.published === true && !e.archivedAt && !!e.eventDate && e.eventDate >= today)
    .map(toPublicEvent)
    .filter((e): e is PublicEvent => e !== null)
    .sort((a, b) => `${a.date} ${a.time ?? "99:99"}`.localeCompare(`${b.date} ${b.time ?? "99:99"}`));
}

const dateFmt = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** "jueves, 29 de octubre · 20:00" (or without the time when not announced). */
export function formatEventDate(e: Pick<PublicEvent, "date" | "time">): string {
  const [y, m, d] = e.date.split("-").map(Number);
  const day = dateFmt.format(new Date(Date.UTC(y, m - 1, d)));
  return e.time ? `${day} · ${e.time}` : day;
}
