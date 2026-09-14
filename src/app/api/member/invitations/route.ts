import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getInvitationsForMember } from "@/lib/matching/memberLifecycle";

export const runtime = "nodejs";

/**
 * Every invitation ever sent TO the signed-in member — deliberately no
 * membership/searchStatus check anywhere in this route or
 * getInvitationsForMember: a passive/free candidate must be able to see
 * (and later respond to) an invitation without any entitlement gate.
 */
export async function GET(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  const invitations = await getInvitationsForMember(auth.uid);
  return NextResponse.json({ ok: true, invitations });
}
