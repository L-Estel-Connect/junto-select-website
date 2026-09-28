import "server-only";

/**
 * Server-only Ticket Tailor client abstraction — analogous in spirit to
 * src/lib/stripe/client.ts, but with one deliberate extra layer:
 * `TICKET_TAILOR_INTEGRATION_VERIFIED` (below).
 *
 * The request/response schemas below reflect TWO real, controlled API
 * tests run against production Ticket Tailor on 2026-09-22 (a temporary
 * TEST discount on a past event's ticket type, created then immediately
 * deleted both times — see the engagement's test reports for the exact
 * HTTP traffic). Verified facts: base URL `https://api.tickettailor.com`,
 * paths under `/v1/...`; HTTP Basic Auth of the form `Basic
 * base64(api_key)` (the raw key alone, NO trailing colon) plus `Accept:
 * application/json`; `application/x-www-form-urlencoded` (NOT JSON)
 * bodies on every mutating request; discount write fields `code`, `name`,
 * `type` (= `percentage`), `price_percent`, `max_redemptions`, `expires`
 * (a single Unix timestamp — there is no `valid_from`/`valid_until`
 * pair), and `ticket_types` associated via REPEATED `ticket_types[]`
 * fields (never comma-joined, never a bare scalar, never indexed
 * brackets, never JSON — a real test proved a comma-joined/bare-scalar
 * `ticket_types` value silently associates nothing, returning
 * `ticket_types: []`). On READ, the discount object's percentage lives
 * under `face_value_percentage` — NOT an echo of the `price_percent`
 * write field — and `expires` comes back as a structured object whose
 * Unix value is at `.expires.unix`, never a bare number.
 *
 * A THIRD real, controlled verification pass was run end-to-end against
 * production on a dedicated, non-customer-facing test event
 * (ticketTailorEventId 2442161, ticket type tt_6869922): discount
 * creation, scoping to exactly one ticket type, a real checkout applying
 * exactly 20%, a second redemption correctly rejected once
 * `max_redemptions: 1` was reached, an already-expired discount correctly
 * rejected with a distinct "expired" error (never confused with the
 * redemption-limit error), and cleanup (both temporary discounts
 * deleted). This is what `TICKET_TAILOR_INTEGRATION_VERIFIED` below now
 * reflects — activation is a deliberate rollout step taken only after
 * this verification passed, not an automatic consequence of the earlier
 * contract-correctness tests alone.
 *
 * IMPORTANT: the real API key used for that verification was exposed to a
 * local shell during manual testing and MUST be rotated in Secret Manager
 * before any real customer-facing use of this integration — see the
 * engagement's test report. Rotating a key does not require touching this
 * flag or any code here.
 */
export const TICKET_TAILOR_INTEGRATION_VERIFIED = true as const;

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
  /**
   * The discount's percentage value as Ticket Tailor reports it back —
   * read from the response's `face_value_percentage` field. NOT the same
   * field name as the `price_percent` write field: Ticket Tailor uses
   * different names for the discount-creation input and the returned
   * representation (verified via a real request/response pair). `null`
   * when Ticket Tailor didn't return a value. Not currently consulted by
   * any caller — Junto tracks its own 20% internally in Firestore — this
   * exists so the real response shape is parsed correctly if a future
   * caller ever needs it.
   */
  percentage: number | null;
}

/**
 * Ticket Tailor's real `expires` response shape — a structured object,
 * NOT a bare Unix number (confirmed via a real create/GET response). No
 * caller currently reads a discount's expiry back from a response (Junto
 * tracks its own validFrom/validUntil internally in Firestore), so this
 * type is intentionally unused by any parsing logic today — it exists
 * purely as a guardrail so a future reader doesn't reintroduce the
 * bare-number assumption. If ever consumed, use `.unix`.
 */
export interface TicketTailorDiscountExpiresResponse {
  unix: number;
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
  /**
   * Genuine entitlement-loss invalidation ONLY. Permanent/irreversible on
   * Ticket Tailor's side. Best-effort from a caller's perspective —
   * callers must treat a thrown error as "external sync failed," never as
   * a reason to skip the Firestore-side invalidation.
   */
  invalidateDiscount(discountId: string): Promise<void>;
}

interface TicketTailorDiscountResponse {
  id: string;
  code: string;
  ticket_types?: string[] | null;
  /** Read field for the percentage value — asymmetric with the `price_percent` write field. See TicketTailorDiscount.percentage. */
  face_value_percentage?: number | null;
  /** Structured, not a bare number — see TicketTailorDiscountExpiresResponse. Unused today; typed here only so a future reader doesn't misparse it. */
  expires?: TicketTailorDiscountExpiresResponse;
}

/**
 * Exported purely so tests can assert the real response-parsing behavior
 * directly — without it, exercising this code path would require flipping
 * TICKET_TAILOR_INTEGRATION_VERIFIED (every LiveTicketTailorClient method
 * refuses to run while it's false), which tests must never do.
 */
export function parseDiscount(data: TicketTailorDiscountResponse): TicketTailorDiscount {
  return {
    id: data.id,
    code: data.code,
    ticketTypeIds: data.ticket_types ?? [],
    percentage: data.face_value_percentage ?? null,
  };
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
 * Verified against a real request/response pair — see the file-level doc
 * comment. Exported purely so tests can assert the exact wire-format
 * fields Ticket Tailor documents, without needing
 * TICKET_TAILOR_INTEGRATION_VERIFIED or a real network call.
 */
export function buildCreateDiscountRequestBody(params: CreateDiscountParams): URLSearchParams {
  const body = new URLSearchParams();
  body.set("code", params.code);
  body.set("name", params.name);
  body.set("type", "percentage");
  body.set("price_percent", String(params.percentage));
  body.set("max_redemptions", String(params.maxRedemptions));
  body.set("expires", String(Math.floor(params.expiresAt.getTime() / 1000)));
  appendTicketTypes(body, params.ticketTypeIds);
  return body;
}

/**
 * Ticket Tailor expects an array value as REPEATED `ticket_types[]`
 * fields — confirmed via a real request/response pair for both one and
 * two ticket types. A comma-joined or bare-scalar `ticket_types` value
 * was proven NOT to associate anything (the response came back with
 * `ticket_types: []`). Deduplicates via `Set` so a caller passing the
 * same id twice (e.g. a union that already contained it) never produces
 * duplicate `ticket_types[]` fields.
 */
function appendTicketTypes(body: URLSearchParams, ticketTypeIds: string[]): void {
  for (const ticketTypeId of new Set(ticketTypeIds)) {
    body.append("ticket_types[]", ticketTypeId);
  }
}

class LiveTicketTailorClient implements TicketTailorClient {
  constructor(private readonly apiKey: string) {}

  private assertVerified(operation: string): void {
    if (!TICKET_TAILOR_INTEGRATION_VERIFIED) {
      throw new Error(
        `ticket_tailor_integration_not_verified: refusing to perform "${operation}" — real integration is not yet activated (see src/lib/ticketTailor/client.ts doc comment: the contract is verified, but activation is a separate, deliberate rollout step).`,
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
    if (!res.ok) {
      // Ticket Tailor's own error response — safe to log in full: it is
      // THEIR description of what was wrong with the request, never an
      // echo of anything we sent (the Authorization header, in particular,
      // never appears in a response body). Truncated defensively in case
      // of an unexpectedly large error page, not for sanitization.
      const body = await res.text().catch(() => "<failed to read response body>");
      throw new Error(`ticket_tailor_create_discount_failed_${res.status}: ${body.slice(0, 2000)}`);
    }
    const data = (await res.json()) as TicketTailorDiscountResponse;
    return parseDiscount(data);
  }

  async findDiscountByCode(code: string): Promise<TicketTailorDiscount | null> {
    this.assertVerified("findDiscountByCode");
    const res = await fetch(`${TICKET_TAILOR_API_BASE}/v1/discounts?code=${encodeURIComponent(code)}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`ticket_tailor_find_discount_failed_${res.status}`);
    const data = (await res.json()) as { data?: TicketTailorDiscountResponse[] };
    const match = data.data?.find((d) => d.code === code);
    return match ? parseDiscount(match) : null;
  }

  async invalidateDiscount(discountId: string): Promise<void> {
    this.assertVerified("invalidateDiscount");
    const res = await fetch(`${TICKET_TAILOR_API_BASE}/v1/discounts/${discountId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`ticket_tailor_invalidate_discount_failed_${res.status}`);
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
