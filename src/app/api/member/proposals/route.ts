import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getProposalsForMember } from "@/lib/matching/memberLifecycle";

export const runtime = "nodejs";

/**
 * Every proposal ever made FOR the signed-in member, with the candidate's
 * PUBLIC profile joined in (see buildPublicProfileView) — never their
 * dealbreakers, score, or admin metadata. `requireFirebaseUser` is the
 * only authorization here; `getProposalsForMember` itself only ever reads
 * `proposals` docs whose `recipientUid` equals the verified uid, so there
 * is no separate "is this yours" check needed beyond the query shape.
 */
export async function GET(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  const proposals = await getProposalsForMember(auth.uid);
  return NextResponse.json({ ok: true, proposals });
}
