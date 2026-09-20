import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getIntroductionsForMember } from "@/lib/matching/memberLifecycle";

export const runtime = "nodejs";

/**
 * The OVERVIEW list for /member/connections — every mutual introduction
 * the signed-in member is a party to, as compact summaries only
 * (firstName/age/city/primaryPhoto — see MemberConnectionSummaryView).
 * Deliberately never the full profile or revealed contact methods: those
 * are only ever returned by GET /api/member/introductions/[id], once the
 * member opens a specific connection. Read-only: there is no decision
 * left to make on an introduction, and no internal chat exists in V1.
 */
export async function GET(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  const introductions = await getIntroductionsForMember(auth.uid);
  return NextResponse.json({ ok: true, introductions });
}
