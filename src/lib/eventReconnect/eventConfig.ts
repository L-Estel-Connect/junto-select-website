import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { EligibleTicketTailorEventDocument } from "@/lib/eventBenefits/types";
import { RECONNECT_DISCOVERY_WINDOW_HOURS, type ReconnectWindowState } from "./types";

/**
 * Wall-clock-in-Madrid -> real UTC instant, correct across the CET/CEST
 * DST boundary. Same `Intl.DateTimeFormat` + `Europe/Madrid` technique
 * eventBenefits/anchor.ts already uses for calendar math, adapted for a
 * single point-in-time conversion (guess in UTC, read back what wall-clock
 * time that guess is in Madrid, correct by the difference — one pass is
 * sufficient since Madrid's UTC offset never exceeds two hours and never
 * changes within so short a correction window).
 */
function madridWallClockToUtc(year: number, month1To12: number, day: number, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(year, month1To12 - 1, day, hour, minute, 0));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(guess);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const guessReadAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = guessReadAsUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

/**
 * Reconnect opens at 00:01 Madrid time on the calendar day AFTER the
 * event's own date — always derived from `eventDate` alone, never stored,
 * so Lara can never configure the two out of sync with each other (see
 * the audit).
 */
export function computeReconnectOpensAt(eventDate: string): Date {
  const [year, month, day] = eventDate.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  return madridWallClockToUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), 0, 1);
}

export function computeReconnectDiscoveryClosesAt(eventDate: string): Date {
  return new Date(computeReconnectOpensAt(eventDate).getTime() + RECONNECT_DISCOVERY_WINDOW_HOURS * 3600 * 1000);
}

/**
 * The single source of truth for "is Reconnect usable for this event right
 * now" — every discovery-facing route (state/search/gallery/request)
 * calls this fresh, server-side, rather than trusting any client-supplied
 * notion of the window. Force-closing always wins regardless of the
 * computed window; `reconnectEnabled=false` always means "not usable" even
 * inside what would otherwise be an open window.
 */
export function reconnectWindowState(
  event: Pick<EligibleTicketTailorEventDocument, "eventDate" | "reconnectEnabled" | "reconnectForceClosedAt">,
  now: Date = new Date(),
): ReconnectWindowState {
  if (!event.reconnectEnabled || !event.eventDate || event.reconnectForceClosedAt) return "discovery_closed";
  const opensAt = computeReconnectOpensAt(event.eventDate);
  const closesAt = computeReconnectDiscoveryClosesAt(event.eventDate);
  if (now.getTime() < opensAt.getTime()) return "not_yet_open";
  if (now.getTime() >= closesAt.getTime()) return "discovery_closed";
  return "open";
}

/**
 * The one manual safety override the audit called for — independent of
 * `reconnectEnabled`, so Lara can immediately kill discovery for an event
 * (an incident, a complaint) without un-registering it or waiting out the
 * 48h window. Never automatically cleared; re-enabling is a deliberate,
 * separate admin action.
 */
export async function setReconnectForceClosed(ticketTailorEventId: string, forceClosed: boolean): Promise<void> {
  await adminDb.doc(`eligibleTicketTailorEvents/${ticketTailorEventId}`).update({
    reconnectForceClosedAt: forceClosed ? FieldValue.serverTimestamp() : null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function getEligibleEvent(ticketTailorEventId: string): Promise<EligibleTicketTailorEventDocument | null> {
  const snap = await adminDb.doc(`eligibleTicketTailorEvents/${ticketTailorEventId}`).get();
  return snap.exists ? (snap.data() as EligibleTicketTailorEventDocument) : null;
}
