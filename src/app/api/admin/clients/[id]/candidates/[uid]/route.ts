import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { notFound } from "@/lib/clients/api";
import { getCandidateDetail } from "@/lib/clients/candidateDetail";
import { getClient } from "@/lib/clients/store";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string; uid: string }> }) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const { id, uid } = await context.params;
  const client = await getClient(id);
  if (!client) return notFound();
  const candidate = await getCandidateDetail(client, uid);
  if (!candidate) return notFound();
  return NextResponse.json({ ok: true, candidate });
}
