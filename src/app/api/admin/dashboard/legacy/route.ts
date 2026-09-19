import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { listLegacyImports } from "@/lib/admin/legacyImports";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const rows = await listLegacyImports();
  rows.sort((a, b) => (b.importedAt ?? "").localeCompare(a.importedAt ?? ""));
  return NextResponse.json({ ok: true, items: rows, total: rows.length });
}
