/**
 * The old automatic Introducciones (monthly proposals, free invitations,
 * mutual introductions and their emails) are switched off for the
 * team-run matchmaking service (Lara, 15 Oct 2026).
 *
 * One reversible switch, off unless NEXT_PUBLIC_AUTOMATIC_INTRODUCTIONS is
 * "true" (available at build and runtime, same pattern as
 * NEXT_PUBLIC_MEMBERSHIP_SALES_OPEN). While off:
 *  - no matching cycle runs (the due scan finds nothing to do; a manual
 *    cycle run is refused), so no proposal is created;
 *  - "Sugerir alguien" in the old member page is refused;
 *  - members can't record new decisions on old proposals or invitations,
 *    so no invitation or introduction is created;
 *  - new_proposal, invitation_received and mutual_introduction emails are
 *    never queued;
 *  - the member area hides Propuestas and Conexiones.
 * Existing proposals, invitations, introductions and their history are
 * kept untouched. Reconnect (events) does not use any of this and keeps
 * working.
 */
export const AUTOMATIC_INTRODUCTIONS_ENABLED = process.env.NEXT_PUBLIC_AUTOMATIC_INTRODUCTIONS === "true";

export class AutomaticIntroductionsDisabledError extends Error {
  constructor() {
    super("automatic_introductions_disabled");
  }
}

export const AUTOMATIC_INTRODUCTION_EMAILS = ["new_proposal", "invitation_received", "mutual_introduction"] as const;
