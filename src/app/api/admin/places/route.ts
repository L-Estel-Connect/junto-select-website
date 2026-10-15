import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { PROVINCES, getPlace, searchPlaces } from "@/lib/geo/places";

export const runtime = "nodejs";

/**
 * Municipality picker for the admin (the table itself stays on the server).
 * `?q=` searches by name, `?ine=` names one municipality, `?provinces=1` lists provinces.
 */
export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const url = new URL(request.url);
  if (url.searchParams.get("provinces")) return NextResponse.json({ ok: true, provinces: PROVINCES });
  const ine = url.searchParams.get("ine");
  if (ine) {
    const p = getPlace(ine);
    return NextResponse.json({ ok: true, places: p ? [{ ine: p.ine, name: p.name, province: p.province, community: p.community }] : [] });
  }
  const q = (url.searchParams.get("q") ?? "").slice(0, 80);
  const places = searchPlaces(q, 12).map(({ ine, name, province, community }) => ({ ine, name, province, community }));
  return NextResponse.json({ ok: true, places });
}
