import "server-only";
import { NextResponse } from "next/server";
import { requireAdminFromAuthHeader, type AdminIdentity } from "./session";

/**
 * Shared guard for every /api/admin/dashboard/* route: returns the verified
 * admin identity, or a ready-to-return 401 response. Every route below
 * starts with `if (admin instanceof NextResponse) return admin;` — this is
 * what "authorization enforced server-side for every admin data endpoint"
 * means concretely, checked independently of whatever the page-load cookie
 * did.
 */
export async function requireAdminOrRespond(request: Request): Promise<AdminIdentity | NextResponse> {
  try {
    return await requireAdminFromAuthHeader(request);
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
}
