import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { setArchived } from "@/lib/events/manager";

export const runtime = "nodejs";

/** Body: { archived: boolean }. Archiving hides the event and unpublishes it; nothing is deleted. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { archived?: unknown };
  if (typeof body.archived !== "boolean") return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  const result = await setArchived(id, body.archived);
  if (!result.ok) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
