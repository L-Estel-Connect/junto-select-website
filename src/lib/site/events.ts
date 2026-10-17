import "server-only";
import { listEligibleEvents } from "@/lib/eventBenefits/eligibleEvents";
import { upcomingPublicEvents, type PublicEvent } from "@/lib/events/publicView";

export type { PublicEvent } from "@/lib/events/publicView";

/**
 * Public encuentros for the homepage and /eventos, read from the same event
 * records the admin Events Manager edits and the 20 % benefit uses (one
 * source of truth). Only published, non-archived, upcoming events, soonest
 * first. A read failure shows the honest empty state rather than an error
 * page.
 */
export async function getUpcomingEvents(now: Date = new Date()): Promise<PublicEvent[]> {
  try {
    return upcomingPublicEvents(await listEligibleEvents(), now);
  } catch (error) {
    console.error("Public events: failed to load", error);
    return [];
  }
}
