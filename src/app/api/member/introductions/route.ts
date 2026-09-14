import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getIntroductionsForMember } from "@/lib/matching/memberLifecycle";

export const runtime = "nodejs";

/**
 * Every mutual introduction the signed-in member is a party to, with the
 * other person's public profile AND their revealed contact methods (see
 * buildRevealedContacts — only methods they actually stored and
 * authorized, never fabricated, never their full contactPreferences).
 * Read-only: there is no decision left to make on an introduction, and no
 * internal chat exists in V1.
 */
export async function GET(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  const introductions = await getIntroductionsForMember(auth.uid);
  return NextResponse.json({ ok: true, introductions });
}
