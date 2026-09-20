import "server-only";

/**
 * Server-only Ticket Tailor client abstraction — analogous in spirit to
 * src/lib/stripe/client.ts, but with one deliberate extra layer:
 * `TICKET_TAILOR_INTEGRATION_VERIFIED` (below). The exact request body
 * fields for creating/associating a discount were NOT independently
 * confirmed against Ticket Tailor's raw API reference during this
 * implementation (the environment this was built in cannot reach
 * developers.tickettailor.com — see the Ticket Tailor API audit report).
 * What IS reasonably well-sourced: the API base URL, that discounts (not
 * vouchers) are the right object for a per-ticket-type percentage code,
 * and that ticket-type association is explicit and per-ticket-type. What
 * is NOT independently confirmed: the exact JSON field names for
 * percentage/max-redemptions/ticket-type-association, and the exact auth
 * header shape.
 *
 * Rather than guess those fields and risk silently sending a malformed
 * request to a real, billable Ticket Tailor account once a real API key
 * is eventually configured, every mutating method on the real
 * (`fetch`-based) implementation refuses to run while
 * `TICKET_TAILOR_INTEGRATION_VERIFIED` is `false`. Flip it to `true` only
 * after a human has confirmed the request shapes in `buildCreateDiscountRequestBody`/
 * `buildAssociateTicketTypesRequestBody` against the real, current API
 * reference at developers.tickettailor.com/docs/api/ — and ideally after
 * a successful call against a Ticket Tailor TEST/sandbox box office, if
 * one is available, before ever pointing this at production.
 */
export const TICKET_TAILOR_INTEGRATION_VERIFIED = false as const;

const TICKET_TAILOR_API_BASE = "https://api.tickettailor.com/v1";

export interface CreateDiscountParams {
  code: string;
  percentage: number;
  maxRedemptions: number;
  ticketTypeIds: string[];
  validFrom: Date;
  validUntil: Date;
}

export interface TicketTailorDiscount {
  /** Ticket Tailor's own object id — stored as EventBenefitDocument.ticketTailorDiscountId. */
  id: string;
  code: string;
}

/**
 * The operations event-benefit lifecycle.ts actually needs — kept small
 * and semantic (never a raw "call this TT endpoint with this body" leak
 * into calling code), so a mock/fake implementing this same interface is
 * all tests ever need, and the real implementation's internals can change
 * (once verified) without touching any caller.
 */
export interface TicketTailorClient {
  createDiscount(params: CreateDiscountParams): Promise<TicketTailorDiscount>;
  /**
   * Used by lifecycle.ts's crash-recovery path — before ever creating a
   * discount, check whether one with this exact (already-unique) code
   * already exists, so a retry after a crash between "Ticket Tailor
   * create succeeded" and "Firestore recorded that success" adopts the
   * existing discount instead of creating a duplicate. Returns `null`
   * when no such discount exists.
   */
  findDiscountByCode(code: string): Promise<TicketTailorDiscount | null>;
  /** Best-effort — callers must treat a thrown error as "external sync failed," never as a reason to skip the Firestore-side invalidation. */
  invalidateDiscount(discountId: string): Promise<void>;
  /** Best-effort, idempotent (associating an already-associated ticket type must be safe to repeat). */
  associateDiscountWithTicketTypes(discountId: string, ticketTypeIds: string[]): Promise<void>;
}

/**
 * NOT independently confirmed — see the file-level doc comment. Isolated
 * into its own function specifically so the one place that needs
 * verification is small, obvious, and easy to re-check against the real
 * docs before `TICKET_TAILOR_INTEGRATION_VERIFIED` is ever flipped.
 */
function buildCreateDiscountRequestBody(params: CreateDiscountParams): Record<string, unknown> {
  return {
    code: params.code,
    percentage_off: params.percentage,
    max_redemptions: params.maxRedemptions,
    ticket_type_ids: params.ticketTypeIds,
    valid_from: params.validFrom.toISOString(),
    valid_until: params.validUntil.toISOString(),
  };
}

function buildAssociateTicketTypesRequestBody(ticketTypeIds: string[]): Record<string, unknown> {
  return { ticket_type_ids: ticketTypeIds };
}

class LiveTicketTailorClient implements TicketTailorClient {
  constructor(private readonly apiKey: string) {}

  private assertVerified(operation: string): void {
    if (!TICKET_TAILOR_INTEGRATION_VERIFIED) {
      throw new Error(
        `ticket_tailor_integration_not_verified: refusing to perform "${operation}" — the request schema has not been confirmed against the real Ticket Tailor API reference yet (see src/lib/ticketTailor/client.ts doc comment).`,
      );
    }
  }

  private authHeader(): string {
    // "API key over HTTP Basic Auth" — corroborated by a third-party
    // summary of the API's auth model, NOT read directly from an official
    // page in this environment. Re-verify before activation.
    return `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`;
  }

  async createDiscount(params: CreateDiscountParams): Promise<TicketTailorDiscount> {
    this.assertVerified("createDiscount");
    const res = await fetch(`${TICKET_TAILOR_API_BASE}/discounts`, {
      method: "POST",
      headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(buildCreateDiscountRequestBody(params)),
    });
    if (!res.ok) throw new Error(`ticket_tailor_create_discount_failed_${res.status}`);
    const data = (await res.json()) as { id: string; code: string };
    return { id: data.id, code: data.code };
  }

  async findDiscountByCode(code: string): Promise<TicketTailorDiscount | null> {
    this.assertVerified("findDiscountByCode");
    // NOT independently confirmed: the exact query-param name for
    // filtering the discount list by code (assumed `code` below). See
    // the "List discounts" doc page cited in the Ticket Tailor API audit
    // — re-verify before activation.
    const res = await fetch(`${TICKET_TAILOR_API_BASE}/discounts?code=${encodeURIComponent(code)}`, {
      headers: { Authorization: this.authHeader() },
    });
    if (!res.ok) throw new Error(`ticket_tailor_find_discount_failed_${res.status}`);
    const data = (await res.json()) as { data?: Array<{ id: string; code: string }> };
    const match = data.data?.find((d) => d.code === code);
    return match ? { id: match.id, code: match.code } : null;
  }

  async invalidateDiscount(discountId: string): Promise<void> {
    this.assertVerified("invalidateDiscount");
    const res = await fetch(`${TICKET_TAILOR_API_BASE}/discounts/${discountId}`, {
      method: "DELETE",
      headers: { Authorization: this.authHeader() },
    });
    if (!res.ok) throw new Error(`ticket_tailor_invalidate_discount_failed_${res.status}`);
  }

  async associateDiscountWithTicketTypes(discountId: string, ticketTypeIds: string[]): Promise<void> {
    this.assertVerified("associateDiscountWithTicketTypes");
    const res = await fetch(`${TICKET_TAILOR_API_BASE}/discounts/${discountId}`, {
      method: "PATCH",
      headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(buildAssociateTicketTypesRequestBody(ticketTypeIds)),
    });
    if (!res.ok) throw new Error(`ticket_tailor_associate_ticket_types_failed_${res.status}`);
  }
}

let cached: TicketTailorClient | null = null;

// TEST-ONLY override storage, deliberately on `globalThis` rather than
// this module's own `cached` variable: a test script that imports this
// module via a different specifier/resolution path than an app module
// does (e.g. a path-aliased `@/...` import resolved from a script outside
// `src/`) can end up with two distinct instances of this module in
// Node's module registry, each with its own `cached` — `globalThis` is
// the one thing guaranteed to be the exact same object across any number
// of module instances in a single process, so the override is guaranteed
// to be visible everywhere regardless of that hazard.
const TEST_OVERRIDE_KEY = Symbol.for("junto.ticketTailor.testClientOverride");
type GlobalWithOverride = typeof globalThis & { [TEST_OVERRIDE_KEY]?: TicketTailorClient | null };

/**
 * Mirrors getStripe()'s lazy-singleton pattern. Throws if
 * TICKET_TAILOR_API_KEY isn't configured — true in every environment this
 * was built/tested in, which is a deliberate safety property, not an
 * oversight: nothing in this codebase can make a real Ticket Tailor call
 * without that secret existing, and even once it does, every mutating
 * call additionally refuses to run until TICKET_TAILOR_INTEGRATION_VERIFIED
 * is flipped to true.
 */
export function getTicketTailorClient(): TicketTailorClient {
  const override = (globalThis as GlobalWithOverride)[TEST_OVERRIDE_KEY];
  if (override) return override;
  if (cached) return cached;
  const key = process.env.TICKET_TAILOR_API_KEY;
  if (!key) {
    throw new Error("TICKET_TAILOR_API_KEY is not configured");
  }
  cached = new LiveTicketTailorClient(key);
  return cached;
}

/**
 * TEST-ONLY seam — installs a fake/mock implementation (or clears it,
 * passing `null`), so emulator test scripts can exercise lifecycle.ts's
 * real control flow (idempotency, crash-recovery, supersede/invalidate
 * logic) without ever making a real Ticket Tailor API call. No
 * application code calls this — only test scripts that import this
 * module directly (never the browser, never a real request handler).
 */
export function __setTicketTailorClientForTesting(client: TicketTailorClient | null): void {
  (globalThis as GlobalWithOverride)[TEST_OVERRIDE_KEY] = client;
}
