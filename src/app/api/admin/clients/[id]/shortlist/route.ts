import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { notFound, readJson } from "@/lib/clients/api";
import { addToShortlist, getShortlist } from "@/lib/clients/shortlist";
import { getClient } from "@/lib/clients/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await context.params;
  if (!(await getClient(id))) return notFound();
  return NextResponse.json({ ok: true, shortlist: await getShortlist(id) });
}

/** One-click "Preseleccionar". Adding someone already on the list is a no-op. Nobody is notified. */
export async function POST(request: Request, context: Ctx) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await context.params;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  if (typeof body.candidateUid !== "string" || !body.candidateUid || body.candidateUid.includes("/")) {
    return NextResponse.json({ ok: false, error: "invalid_candidate" }, { status: 400 });
  }
  if (!(await getClient(id))) return notFound();
  const score = typeof body.score === "number" && body.score >= 0 && body.score <= 100 ? Math.round(body.score) : null;
  const result = await addToShortlist(id, body.candidateUid, score, admin.email);
  if (!result.ok) return NextResponse.json(result, { status: 404 });
  return NextResponse.json(result);
}
