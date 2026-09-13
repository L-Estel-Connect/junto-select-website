import "server-only";
import { NextResponse } from "next/server";
import { adminAuth } from "./admin";

/**
 * Shared "Bearer <Firebase ID token>" verification for authenticated API
 * routes — the same check `/api/introduction/generate-presentation`
 * inlines, factored out now that billing adds three more routes needing
 * the identical pattern. Returns the verified uid/email, or a ready-to-return
 * 401 `NextResponse` when the header is missing or the token doesn't verify.
 */
export async function requireFirebaseUser(
  request: Request,
): Promise<{ uid: string; email: string | null } | NextResponse> {
  const authHeader = request.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!idToken) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
}
