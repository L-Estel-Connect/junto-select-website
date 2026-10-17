import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { setPublished } from "@/lib/events/manager";

export const runtime = "nodejs";

/** Body: { published: boolean }. Publishing shows the event on Inicio and Encuentros at once. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { published?: unknown };
  if (typeof body.published !== "boolean") return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  const result = await setPublished(id, body.published);
  if (!result.ok) return NextResponse.json({ ok: false, error: `${result.error}: ${result.message}` }, { status: 400 });
  return NextResponse.json({ ok: true });
}
