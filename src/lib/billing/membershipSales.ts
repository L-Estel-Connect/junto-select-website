/**
 * The old Membresía Select is closed to new subscriptions (Lara, 15 Oct 2026).
 *
 * One reversible switch for the whole site: new purchases are refused by the
 * checkout APIs, /membresia and /membresia/alta redirect to /matchmaking, and
 * the account no longer offers a plan. Setting
 * NEXT_PUBLIC_MEMBERSHIP_SALES_OPEN=true (available at build and runtime)
 * and redeploying reopens everything. Existing subscriptions, the Customer
 * Portal, cancellation, the Stripe webhook and billing records are never
 * affected by this switch.
 */
export const MEMBERSHIP_SALES_OPEN = process.env.NEXT_PUBLIC_MEMBERSHIP_SALES_OPEN === "true";
