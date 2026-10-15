import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { notFound, readJson } from "@/lib/clients/api";
import { removeFromShortlist, updateShortlistEntry } from "@/lib/clients/shortlist";
import { isShortlistStatus, type ShortlistStatus } from "@/lib/clients/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; entryId: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const { id, entryId } = await context.params;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  const patch: { status?: ShortlistStatus; note?: string } = {};
  if (body.status !== undefined) {
    if (!isShortlistStatus(body.status)) return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
    patch.status = body.status;
  }
  if (body.note !== undefined) {
    if (typeof body.note !== "string" || body.note.length > 4000) {
      return NextResponse.json({ ok: false, error: "invalid_note" }, { status: 400 });
    }
    patch.note = body.note;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
  const result = await updateShortlistEntry(id, entryId, patch, admin.email);
  if (result === "not_found") return notFound();
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: Ctx) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const { id, entryId } = await context.params;
  if ((await removeFromShortlist(id, entryId)) === "not_found") return notFound();
  return NextResponse.json({ ok: true });
}
