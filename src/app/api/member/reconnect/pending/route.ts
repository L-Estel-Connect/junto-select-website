import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { adminDb } from "@/lib/firebase/admin";
import { withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";
import { resolvePersonId } from "@/lib/matching/identity";
import { listPendingReconnectRequestsForMember } from "@/lib/eventReconnect/requests";

export const runtime = "nodejs";

/**
 * Every Reconnect request still awaiting action, in either direction, for
 * the signed-in caller — this is what a member sees once discovery has
 * closed but a request they sent or received is still within its own
 * 72h response window (see the audit: never a reopened gallery).
 */
export async function GET(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  const profileSnap = await adminDb.doc(`profiles/${auth.uid}`).get();
  if (!profileSnap.exists) return NextResponse.json({ ok: true, results: [] });
  const profile = withProfileDefaults(auth.uid, profileSnap.data() as Partial<ProfileDocument>);
  const personId = resolvePersonId(auth.uid, profile);

  const results = await listPendingReconnectRequestsForMember(personId);
  return NextResponse.json({ ok: true, results });
}
