import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { notFound } from "@/lib/clients/api";
import { searchForClient } from "@/lib/clients/search";
import { getClient } from "@/lib/clients/store";

export const runtime = "nodejs";

/** "Buscar perfiles compatibles". Reads only: no proposal, email or record is created. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await context.params;
  const client = await getClient(id);
  if (!client) return notFound();
  const result = await searchForClient(client);
  return NextResponse.json({ ok: true, ...result });
}
