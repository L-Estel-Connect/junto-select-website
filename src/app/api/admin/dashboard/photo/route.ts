import { NextResponse } from "next/server";
import { requireAdminFromCookie } from "@/lib/admin/session";
import { adminDb, getAdminStorageBucket } from "@/lib/firebase/admin";

export const runtime = "nodejs";

// profiles/{uid}/photos/{photoId} — the exact, and only, shape a photo path takes (see photos.ts).
const PHOTO_PATH_RE = /^profiles\/([^/]+)\/photos\/[^/]+$/;

/**
 * Streams photo bytes through the server rather than ever creating a
 * Storage signed/download URL — the same "no bypass token, ever" principle
 * storage.rules already documents for profiles/{uid}/photos/{photoId}
 * (owner-only via the authenticated SDK's getBytes, never getDownloadURL).
 * An <img> tag can't send an Authorization header, so this is
 * cookie-authenticated (the same ADMIN_TOKEN_COOKIE the dashboard page
 * load itself required) rather than the Bearer-header pattern the other
 * /api/admin/dashboard/* routes use.
 */
export async function GET(request: Request) {
  const admin = await requireAdminFromCookie().catch(() => null);
  if (!admin) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const path = new URL(request.url).searchParams.get("path") ?? "";
  const match = PHOTO_PATH_RE.exec(path);
  if (!match) return NextResponse.json({ ok: false, error: "invalid_path" }, { status: 400 });

  // Defense in depth against blind path enumeration outside the
  // profiles/*/photos/* prefix the regex already constrains to: the uid
  // segment must correspond to a real profile.
  const uid = match[1];
  const profileSnap = await adminDb.doc(`profiles/${uid}`).get();
  if (!profileSnap.exists) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  try {
    const [bytes] = await getAdminStorageBucket().file(path).download();
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}
