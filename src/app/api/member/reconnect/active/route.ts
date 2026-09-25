import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { adminDb } from "@/lib/firebase/admin";
import { withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";
import { resolvePersonId } from "@/lib/matching/identity";
import { getActiveReconnectEventForMember } from "@/lib/eventReconnect/discovery";

export const runtime = "nodejs";

/**
 * Tells MemberHome.tsx whether there's a currently-relevant Reconnect event
 * for the signed-in member, so it can show its small additive card without
 * already knowing an eventId. Returns `event: null` (never an error) when
 * there's nothing to show — that's the normal, most common case.
 */
export async function GET(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.email) return NextResponse.json({ ok: true, event: null });

  const profileSnap = await adminDb.doc(`profiles/${auth.uid}`).get();
  if (!profileSnap.exists) return NextResponse.json({ ok: true, event: null });
  const profile = withProfileDefaults(auth.uid, profileSnap.data() as Partial<ProfileDocument>);
  const personId = resolvePersonId(auth.uid, profile);

  const event = await getActiveReconnectEventForMember(auth.email, personId);
  return NextResponse.json({ ok: true, event });
}
