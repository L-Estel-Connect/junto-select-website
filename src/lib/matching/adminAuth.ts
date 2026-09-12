import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Every /api/admin/matching/* route is gated by this shared secret rather
 * than a Firebase custom-claims admin role — there is no admin-role
 * infrastructure in this app yet, and building one would mean IAM/Console
 * work outside this codebase. MATCHING_ADMIN_SECRET is a RUNTIME-only
 * Secret Manager reference in apphosting.yaml, mirroring how
 * ANTHROPIC_API_KEY is already configured — see README for setup.
 */
export function isAuthorizedAdminRequest(request: Request): boolean {
  const expected = process.env.MATCHING_ADMIN_SECRET;
  if (!expected) return false;

  const provided = request.headers.get("x-admin-secret") ?? "";
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
