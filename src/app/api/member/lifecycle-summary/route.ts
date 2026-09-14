import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getLifecycleSummaryForMember } from "@/lib/matching/memberLifecycle";

export const runtime = "nodejs";

/**
 * Cheap counts (never the full joined payload) for the dashboard/nav
 * "something needs your attention" indicators — see MemberHome.tsx and
 * MemberNav.tsx. Deliberately just three numbers, not a new notification
 * system: the same three collections the proposals/invitations/
 * introductions routes already read, counted instead of joined.
 */
export async function GET(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  const summary = await getLifecycleSummaryForMember(auth.uid);
  return NextResponse.json({ ok: true, summary });
}
