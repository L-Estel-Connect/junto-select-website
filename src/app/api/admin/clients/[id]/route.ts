import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { notFound, readJson, todayMadrid, validationResponse } from "@/lib/clients/api";
import { getShortlist } from "@/lib/clients/shortlist";
import { getClient, updateClient } from "@/lib/clients/store";
import { sanitizeClientPatch } from "@/lib/clients/validate";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await context.params;
  const client = await getClient(id);
  if (!client) return notFound();
  const shortlist = await getShortlist(id);
  return NextResponse.json({ ok: true, client, shortlist });
}

export async function PATCH(request: Request, context: Ctx) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await context.params;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  try {
    const patch = sanitizeClientPatch(body, todayMadrid());
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
    }
    const client = await updateClient(id, patch, admin.email);
    if (!client) return notFound();
    return NextResponse.json({ ok: true, client });
  } catch (error) {
    return validationResponse(error);
  }
}
