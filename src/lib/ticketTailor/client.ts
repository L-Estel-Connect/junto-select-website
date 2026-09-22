import "server-only";

/**
 * Server-only Ticket Tailor client abstraction — analogous in spirit to
 * src/lib/stripe/client.ts, but with one deliberate extra layer:
 * `TICKET_TAILOR_INTEGRATION_VERIFIED` (below).
 *
 * The request schemas below were corrected against Ticket Tailor's 2026
 * official API documentation (manually verified by a human against
 * developers.tickettailor.com/docs/api/, not independently re-fetched by
 * this codebase): base URL `https://api.tickettailor.com`, paths under
 * `/v1/...`, HTTP Basic Auth of the form `Basic base64(api_key)` (the raw
 * key alone, NO trailing colon), an `Accept: application/json` header,
 * and `application/x-www-form-urlencoded` (NOT JSON) bodies on every
 * mutating request. Discount fields: `code`, `name`, `type` (=
 * `percentage`), `price_percent`, `max_redemptions`, `expires` (a single
 * Unix timestamp — there is no `valid_from`/`valid_until` pair), and
 * `ticket_types` (the associated ticket type ids).
 *
 * One assumption remains genuinely unverified: the exact
 * application/x-www-form-urlencoded encoding Ticket Tailor expects for
 * the `ticket_types` array value (this implementation sends it as a
 * comma-separated string — a reasonable default for this API style, but
 * not confirmed against a real request/response). Because of that single
 * remaining gap, `TICKET_TAILOR_INTEGRATION_VERIFIED` stays `false` below
 * — flip it only once that encoding has been confirmed (ideally via a
 * real call against a Ticket Tailor test/sandbox box office) so nothing
 * here can silently misfire against a real, billable account.
 */
export const TICKET_TAILOR_INTEGRATION_VERIFIED = false as const;

const TICKET_TAILOR_API_BASE = "https://api.tickettailor.com";

export interface CreateDiscountParams {
  code: string;
  name: string;
  percentage: number;
  maxRedemptions: number;
  ticketTypeIds: string[];
  expiresAt: Date;
}

export interface TicketTailorDiscount {
  /** Ticket Tailor's own object id — stored as EventBenefitDocument.ticketTailorDiscountId. */
  id: string;
  code: string;
  /** The ticket type ids currently associated with this discount, per Ticket Tailor's own record. */
  ticketTypeIds: string[];
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
  /** Reads a discount's current state — used to union-merge ticket_types before an update, never to drive a blind overwrite. */
  getDiscount(discountId: string): Promise<TicketTailorDiscount>;
  /**
   * Genuine entitlement-loss invalidation ONLY (never routine monthly
   * supersession, which relies solely on the discount's own `expires`).
   * Permanent/irreversible on Ticket Tailor's side. Best-effort from a
   * caller's perspective — callers must treat a thrown error as "external
   * sync failed," never as a reason to skip the Firestore-side
   * invalidation.
   */
  invalidateDiscount(discountId: string): Promise<void>;
  /**
   * Idempotent, non-destructive: reads the discount's currently
   * associated ticket types, unions them with `ticketTypeIds`, and only
   * ever grows the associated set — safe to call repeatedly and safe to
   * call for an event whose ticket types were already associated.
   */
  associateDiscountWithTicketTypes(discountId: string, ticketTypeIds: string[]): Promise<void>;
}

function parseDiscount(data: { id: string; code: string; ticket_types?: string[] | null }): TicketTailorDiscount {
  return { id: data.id, code: data.code, ticketTypeIds: data.ticket_types ?? [] };
}

/**
 * Ticket Tailor's documented auth format: `Basic Base64Encode(api_key)` —
 * the raw key alone, with NO trailing colon (unlike the Stripe-style
 * `apiKey:` convention). Exported as a pure function so its exact
 * encoding can be verified directly in tests without needing
 * TICKET_TAILOR_INTEGRATION_VERIFIED or a real network call.
 */
export function buildTicketTailorAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(apiKey).toString("base64")}`;
}

/**
 * NOT independently confirmed — see the file-level doc comment. The
 * `ticket_types` encoding (comma-separated) is the one remaining
 * assumption; everything else here reflects the verified 2026 API
 * reference. Exported (alongside `buildTicketTypesUpdateRequestBody`)
 * purely so tests can assert the exact wire-format fields Ticket Tailor
 * documents, without needing TICKET_TAILOR_INTEGRATION_VERIFIED or a real
 * network call.
 */
export function buildCreateDiscountRequestBody(params: CreateDiscountParams): URLSearchParams {
  const body = new URLSearchParams();
  body.set("code", params.code);
  body.set("name", params.name);
  body.set("type", "percentage");
  body.set("price_percent", String(params.percentage));
  body.set("max_redemptions", String(params.maxRedemptions));
  body.set("expires", String(Math.floor(params.expiresAt.getTime() / 1000)));
  body.set("ticket_types", params.ticketTypeIds.join(","));
  return body;
}

export function buildTicketTypesUpdateRequestBody(ticketTypeIds: string[]): URLSearchParams {
  const body = new URLSearchParams();
  body.set("ticket_types", ticketTypeIds.join(","));
  return body;
}

class LiveTicketTailorClient implements TicketTailorClient {
  constructor(private readonly apiKey: string) {}

  private assertVerified(operation: string): void {
    if (!TICKET_TAILOR_INTEGRATION_VERIFIED) {
      throw new Error(
        `ticket_tailor_integration_not_verified: refusing to perform "${operation}" — the request schema has not been fully confirmed against the real Ticket Tailor API reference yet (see src/lib/ticketTailor/client.ts doc comment).`,
      );
    }
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: buildTicketTailorAuthHeader(this.apiKey),
      Accept: "application/json",
      ...extra,
    };
  }

  async createDiscount(params: CreateDiscountParams): Promise<TicketTailorDiscount> {
    this.assertVerified("createDiscount");
    const res = await fetch(`${TICKET_TAILOR_API_BASE}/v1/discounts`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/x-www-form-urlencoded" }),
      body: buildCreateDiscountRequestBody(params),
    });
    if (!res.ok) throw new Error(`ticket_tailor_create_discount_failed_${res.status}`);
    const data = (await res.json()) as { id: string; code: string; ticket_types?: string[] | null };
    return parseDiscount(data);
  }

  async findDiscountByCode(code: string): Promise<TicketTailorDiscount | null> {
    this.assertVerified("findDiscountByCode");
    const res = await fetch(`${TICKET_TAILOR_API_BASE}/v1/discounts?code=${encodeURIComponent(code)}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`ticket_tailor_find_discount_failed_${res.status}`);
    const data = (await res.json()) as { data?: Array<{ id: string; code: string; ticket_types?: string[] | null }> };
    const match = data.data?.find((d) => d.code === code);
    return match ? parseDiscount(match) : null;
  }

  async getDiscount(discountId: string): Promise<TicketTailorDiscount> {
    this.assertVerified("getDiscount");
    const res = await fetch(`${TICKET_TAILOR_API_BASE}/v1/discounts/${discountId}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`ticket_tailor_get_discount_failed_${res.status}`);
    const data = (await res.json()) as { id: string; code: string; ticket_types?: string[] | null };
    return parseDiscount(data);
  }

  async invalidateDiscount(discountId: string): Promise<void> {
    this.assertVerified("invalidateDiscount");
    const res = await fetch(`${TICKET_TAILOR_API_BASE}/v1/discounts/${discountId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`ticket_tailor_invalidate_discount_failed_${res.status}`);
  }

  async associateDiscountWithTicketTypes(discountId: string, ticketTypeIds: string[]): Promise<void> {
    this.assertVerified("associateDiscountWithTicketTypes");
    // Ticket Tailor has no separate association endpoint — this reads the
    // discount's currently associated ticket types first and updates with
    // the UNION, so syncing a newly eligible event never accidentally
    // drops a ticket type already associated from an earlier sync.
    const current = await this.getDiscount(discountId);
    const union = new Set([...current.ticketTypeIds, ...ticketTypeIds]);
    const res = await fetch(`${TICKET_TAILOR_API_BASE}/v1/discounts/${discountId}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/x-www-form-urlencoded" }),
      body: buildTicketTypesUpdateRequestBody([...union]),
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
