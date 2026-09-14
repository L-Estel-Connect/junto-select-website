import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { findActiveSearchMembersMissingSchedulingFields } from "@/lib/admin/matchingHealth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const issues = await findActiveSearchMembersMissingSchedulingFields();
  return NextResponse.json({ ok: true, issues });
}
