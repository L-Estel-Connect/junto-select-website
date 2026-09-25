import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { adminDb } from "@/lib/firebase/admin";
import { withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";
import { resolvePersonId } from "@/lib/matching/identity";
import { decideReconnectRequest } from "@/lib/eventReconnect/requests";

export const runtime = "nodejs";

/**
 * The recipient's accept/decline on a Reconnect request. decideReconnectRequest
 * itself re-verifies the caller is the recipient (never trusts the :id path
 * segment alone) and that the request is still within its response deadline.
 * On accept it creates a real IntroductionDocument, so from that point on
 * this pair is governed by the identical Connexiones/contact-reveal pipeline
 * as any other introduction.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;

  let body: { decision?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (body.decision !== "accept" && body.decision !== "decline") {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const profileSnap = await adminDb.doc(`profiles/${auth.uid}`).get();
  if (!profileSnap.exists) return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 400 });
  const profile = withProfileDefaults(auth.uid, profileSnap.data() as Partial<ProfileDocument>);
  const personId = resolvePersonId(auth.uid, profile);

  const result = await decideReconnectRequest(id, auth.uid, personId, body.decision);
  if (!result.ok) {
    const status = result.error === "not_your_request" ? 403 : result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, status: result.status });
}
