import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { readJson } from "@/lib/clients/api";
import { setConfirmedPlace } from "@/lib/clients/locations";

export const runtime = "nodejs";

/** The team picks the right municipality for a candidate's ambiguous city, or clears its choice (`ine: null`). */
export async function PUT(request: Request, context: { params: Promise<{ uid: string }> }) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const { uid } = await context.params;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  const ine = body.ine === null ? null : typeof body.ine === "string" ? body.ine : undefined;
  if (ine === undefined || !uid || uid.includes("/")) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const result = await setConfirmedPlace(uid, ine, admin.email);
  if (result !== "ok") return NextResponse.json({ ok: false, error: result }, { status: result === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok: true });
}
