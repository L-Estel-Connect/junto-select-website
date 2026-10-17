import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { listInquiries } from "@/lib/admin/inquiries";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const items = await listInquiries();
  return NextResponse.json({ ok: true, items });
}
