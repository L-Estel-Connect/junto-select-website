import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getIntroductionDetailForMember } from "@/lib/matching/memberLifecycle";

export const runtime = "nodejs";

/**
 * The DETAIL view for a single connection — /member/connections/[id]'s
 * data source. Unlike the overview list, this returns the full public
 * profile AND the legitimately revealed contact methods (see
 * buildRevealedContacts) for the other party.
 *
 * Ownership is never taken from the `:id` path segment alone:
 * getIntroductionDetailForMember re-fetches the introduction doc and
 * checks the AUTHENTICATED caller's uid against its own uidA/uidB before
 * building anything. A mismatch and a genuinely nonexistent id return the
 * identical 404 shape on purpose, so a signed-in member gains no signal
 * about whether a guessed introduction id exists at all.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;

  const result = await getIntroductionDetailForMember(auth.uid, id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
  }
  return NextResponse.json({ ok: true, introduction: result.introduction });
}
