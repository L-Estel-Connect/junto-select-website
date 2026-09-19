import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { acceptLegacyTerms } from "@/lib/legacyImport/claim";

export const runtime = "nodejs";

/**
 * Records explicit acceptance of the CURRENT Terms/Privacy versions on
 * the caller's own claimed `legacyImports` doc — see claim.ts's
 * `acceptLegacyTerms` doc comment. Same no-client-supplied-email
 * contract as /api/legacy/claim: only the authenticated caller's own
 * verified email is ever used to locate the doc, and the doc must
 * already be claimed BY THIS SAME uid or the write is refused.
 */
export async function POST(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  const { uid, email } = auth;

  if (!email) {
    return NextResponse.json({ ok: false, error: "no_verified_email" }, { status: 400 });
  }

  const result = await acceptLegacyTerms(uid, email);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.error === "not_found" ? 404 : 403 });
  }

  return NextResponse.json({ ok: true });
}
