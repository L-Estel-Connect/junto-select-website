import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { getMemberDetail } from "@/lib/admin/memberDetail";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ uid: string }> }) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const { uid } = await context.params;
  const detail = await getMemberDetail(uid);
  if (!detail) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, member: detail });
}
