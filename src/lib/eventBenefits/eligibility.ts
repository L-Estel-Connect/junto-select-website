import "server-only";
import { isEntitledStatus, type BillingDocument } from "@/lib/billing/types";

/**
 * Converts any Date to its Europe/Madrid calendar date as "YYYY-MM-DD" —
 * the SAME representation `eligibleTicketTailorEvents.eventDate` is
 * already stored in (see EligibleTicketTailorEventDocument's doc
 * comment), so every comparison in this file is a same-precision,
 * same-timezone string comparison, never a mix of an exact UTC instant
 * against a dateless calendar day. ISO "YYYY-MM-DD" strings sort/compare
 * correctly with plain `<`/`<=`, so no Date parsing is needed at the call
 * site.
 */
export function madridCalendarDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * The exact instant a benefit for this event should stop being usable —
 * end of the event's own calendar day, Madrid-local. Used both as the
 * Firestore `validUntil` shown to the member/admin and as the Ticket
 * Tailor discount's own `expires` value. Deliberately the event's date
 * itself, not a separate sales-close field — no such field exists in the
 * model today (see the approved architecture decision); this can never
 * expire a code before the event happens, only possibly later than a more
 * precise Ticket-Tailor-side sales-close would.
 */
function madridOffsetMinutesAt(utcInstant: Date): number {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    timeZoneName: "shortOffset",
  })
    .formatToParts(utcInstant)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = part?.match(/GMT([+-]\d+)/);
  return (match ? Number(match[1]) : 1) * 60;
}

export function eventEndOfDayMadrid(eventDateYMD: string): Date {
  const [year, month, day] = eventDateYMD.split("-").map(Number);
  // Madrid is always UTC+1 (CET) or UTC+2 (CEST) — first guess using the
  // smaller offset, then resolve the REAL offset from that guess (DST
  // transitions happen near 1am local, nowhere near 23:59:59 local, so a
  // guess within an hour of the true instant always yields the correct
  // offset for the target moment itself).
  const guessUtc = Date.UTC(year, month - 1, day, 23, 59, 59, 999) - 60 * 60 * 1000;
  const offsetMinutes = madridOffsetMinutesAt(new Date(guessUtc));
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - offsetMinutes * 60 * 1000);
}

/**
 * The exact, approved eligibility rule (see the architecture decision
 * document): a member qualifies for an event's benefit only if the
 * event's OWN Madrid calendar date falls on or before the Madrid
 * calendar date of their ALREADY-KNOWN `currentPeriodEnd` — never a
 * future, merely-expected renewal. `isEntitledStatus` is preserved
 * unchanged (active/trialing/past_due), so `past_due`'s existing
 * "still entitled during dunning" treatment carries over automatically.
 * `cancelAtPeriodEnd` needs no special case: Stripe never changes
 * `currentPeriodEnd` just because a subscription won't renew, so an event
 * on/before that date remains eligible exactly as if the member weren't
 * cancelling. A `null` `currentPeriodEnd` fails closed — never grants.
 */
export function isMemberEligibleForEvent(billing: BillingDocument, eventDateYMD: string): boolean {
  if (!isEntitledStatus(billing.status)) return false;
  const currentPeriodEnd = toDate(billing.currentPeriodEnd);
  if (!currentPeriodEnd) return false;
  return eventDateYMD <= madridCalendarDate(currentPeriodEnd);
}

/**
 * Adds whole calendar months to a YYYY-MM-DD date, keeping the anchor's
 * day of month and clamping it to shorter months (Jan 31 + 1 = Feb 28/29,
 * + 2 = Mar 31), so the cycles line up with Stripe's own renewal days.
 */
export function addMonthsYMD(anchorYMD: string, months: number): string {
  const [year, month, day] = anchorYMD.split("-").map(Number);
  const target0 = month - 1 + months;
  const y = year + Math.floor(target0 / 12);
  const m = ((target0 % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export interface BenefitCycle {
  /** 0 for the subscription's first month, then 1, 2, … — never resets on renewal, only on a new subscription. */
  index: number;
  /** Madrid calendar dates; `end` is exclusive. */
  start: string;
  end: string;
}

/**
 * The monthly 20 % benefit cycle running today, or null when there isn't
 * one. Cycles are calendar months counted from the subscription's own
 * start date, whatever the plan length: a monthly plan has one per
 * payment, a 3-month plan three, a 6-month plan six. Fails closed:
 * not entitled, no known start date, or today already past the paid
 * period (`currentPeriodEnd`, e.g. a renewal still being retried) all
 * mean no cycle, so no new code. Renewals need no special handling: the
 * cycles keep counting from the same start date.
 */
export function currentBenefitCycle(
  billing: BillingDocument,
  subscriptionStartedAt: Date | null,
  now: Date,
): BenefitCycle | null {
  if (!isEntitledStatus(billing.status)) return null;
  const periodEnd = toDate(billing.currentPeriodEnd);
  if (!periodEnd || !subscriptionStartedAt) return null;

  const today = madridCalendarDate(now);
  const anchor = madridCalendarDate(subscriptionStartedAt);
  if (today < anchor || today >= madridCalendarDate(periodEnd)) return null;

  // Months between anchor and today, then corrected for the day of month.
  const [ay, am] = anchor.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  let index = (ty - ay) * 12 + (tm - am);
  while (index > 0 && addMonthsYMD(anchor, index) > today) index -= 1;
  while (addMonthsYMD(anchor, index + 1) <= today) index += 1;

  return { index, start: addMonthsYMD(anchor, index), end: addMonthsYMD(anchor, index + 1) };
}

/** An event is still worth scanning for benefits only while it hasn't happened yet. */
export function isEventUpcoming(eventDateYMD: string, now: Date): boolean {
  return eventDateYMD >= madridCalendarDate(now);
}

function toDate(value: unknown): Date | null {
  const t = value as { toDate?: () => Date } | null | undefined;
  if (t?.toDate) return t.toDate();
  if (value instanceof Date) return value;
  return null;
}
