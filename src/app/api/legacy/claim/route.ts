import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { claimLegacyContact } from "@/lib/legacyImport/claim";

export const runtime = "nodejs";

/**
 * Claims a legacy-contact profile for the CALLING authenticated user —
 * and only ever for that exact user's own server-verified email. This
 * route deliberately takes NO request body at all: there is no `email`
 * field to read, from a query param, JSON body, or anywhere else. The
 * ONLY email this ever considers is the one Firebase Auth itself
 * verified belongs to the caller (via `requireFirebaseUser`'s ID-token
 * verification, then re-confirmed here via `emailVerified` — see below).
 * A client-supplied identifier can therefore never be "proof" of
 * anything here, by construction, not merely by convention — see the
 * spec's own "do not allow ?email=... to be sufficient proof of
 * ownership" requirement.
 */
export async function POST(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  const { uid, email } = auth;

  if (!email) {
    return NextResponse.json({ ok: false, error: "no_verified_email" }, { status: 400 });
  }

  // Belt-and-braces: `requireFirebaseUser` already verified the ID token
  // itself, but a magic-link/Google account's `email_verified` claim is
  // re-checked directly against the Auth user record here, since a
  // stolen/forged claim is exactly the scenario this endpoint must be
  // hardened against.
  let emailVerified = false;
  try {
    const user = await adminAuth.getUser(uid);
    emailVerified = user.emailVerified;
  } catch {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  if (!emailVerified) {
    return NextResponse.json({ ok: false, error: "email_not_verified" }, { status: 403 });
  }

  const result = await claimLegacyContact(uid, email);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, state: result.state });
}
