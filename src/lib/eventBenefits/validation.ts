/**
 * Plain, pure validation — no Firebase imports — shared by the admin
 * route (server) and directly unit-testable without Firestore/emulator.
 */

const TICKET_TYPE_ID_PATTERN = /^tt_[A-Za-z0-9]+$/;
/** A real Ticket Tailor EVENT id (e.g. "2442161") is always purely numeric — this is exactly the shape of the real mistake this validation exists to catch. */
const EVENT_ID_LOOKING_PATTERN = /^\d+$/;

export interface TicketTypeIdValidationResult {
  valid: boolean;
  /** Present only when `valid` is false — a specific, actionable Spanish message naming the offending id. */
  error?: string;
}

/**
 * Every Ticket Tailor ticket type id starts with `tt_` — confirmed
 * empirically (see ticketTailor/client.ts's doc comment) and directly by
 * Ticket Tailor's own real VALIDATION_ERROR response: "ticket_types is
 * either missing or does not start with the prefix tt_". Gives a
 * DIFFERENT, more specific message for a bare numeric id — the exact real
 * mistake that caused a genuine production incident (a Ticket Tailor
 * EVENT id typed into the ticket-type field) — rather than a generic
 * "invalid format" that wouldn't have named the actual confusion.
 */
export function validateTicketTypeId(id: string): TicketTypeIdValidationResult {
  if (TICKET_TYPE_ID_PATTERN.test(id)) return { valid: true };
  if (EVENT_ID_LOOKING_PATTERN.test(id)) {
    return {
      valid: false,
      error: `"${id}" parece ser el ID del EVENTO de Ticket Tailor, no un ID de TIPO DE ENTRADA. Los IDs de tipo de entrada siempre empiezan por "tt_" (por ejemplo, tt_6869922) — no uses aquí el ID del evento.`,
    };
  }
  return {
    valid: false,
    error: `"${id}" no es un ID de tipo de entrada válido. Debe empezar por "tt_" (por ejemplo, tt_6869922).`,
  };
}

/** Validates every id in the list, stopping at (and reporting) the first invalid one. An empty list is trivially valid — callers enforce "at least one required" separately, since that rule depends on whether the benefit is enabled. */
export function validateTicketTypeIds(ids: string[]): TicketTypeIdValidationResult {
  for (const id of ids) {
    const result = validateTicketTypeId(id);
    if (!result.valid) return result;
  }
  return { valid: true };
}

/**
 * The member-facing checkout URL only needs to be a well-formed absolute
 * http(s) URL — deliberately NOT restricted to any specific hostname
 * pattern. Ticket Tailor's real public checkout URL format has never been
 * independently verified in this engagement, and the architecture
 * decision was explicit: never invent a URL pattern, only validate what's
 * pasted is a real, usable link.
 */
export function isValidCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
