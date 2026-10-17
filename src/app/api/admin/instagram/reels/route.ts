import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { describeError } from "@/lib/admin/describeError";
import { listRecentMedia } from "@/lib/instagram/graph";
import { readToken } from "@/lib/instagram/store";

export const runtime = "nodejs";

/** Read-only: the connected account's recent posts, so one Reel can be identified for the automation. */
export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const token = await readToken();
    if (!token) return NextResponse.json({ ok: false, error: "not_connected" }, { status: 409 });
    const media = await listRecentMedia(token);
    return NextResponse.json({
      ok: true,
      media: media.map((m) => ({
        id: m.id,
        caption: m.caption?.slice(0, 120) ?? null,
        productType: m.media_product_type ?? null,
        mediaType: m.media_type ?? null,
        permalink: m.permalink ?? null,
        timestamp: m.timestamp ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "failed_to_load_media", detail: describeError(error) }, { status: 502 });
  }
}
