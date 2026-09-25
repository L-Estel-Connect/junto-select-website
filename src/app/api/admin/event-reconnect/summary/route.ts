import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { getReconnectAdminSummary } from "@/lib/eventReconnect/adminSummary";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });

  const summary = await getReconnectAdminSummary(eventId);
  return NextResponse.json({ ok: true, summary });
}
