import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { getAdminStorageBucket } from "@/lib/firebase/admin";
import { isAuthorizedToViewProfile } from "@/lib/matching/memberAuthorization";

export const runtime = "nodejs";

// profiles/{uid}/photos/{photoId} — the exact, and only, shape a photo path takes (see photos.ts).
const PHOTO_PATH_RE = /^profiles\/([^/]+)\/photos\/[^/]+$/;

/**
 * Streams another member's photo bytes through the server — the
 * member-facing counterpart to /api/admin/dashboard/photo, needed because
 * storage.rules is (correctly) owner-only: a member's own
 * PrivatePhotoThumbnail reads via the authenticated Storage SDK directly,
 * but that same rule means the client SDK can NEVER read a candidate's,
 * inviter's, or introduction partner's photo — there is no rules change
 * that could allow this safely (a Storage rule can't express "only if a
 * proposal/invitation/introduction connects these two specific uids"
 * without duplicating Firestore lookups inside a Storage rule, which
 * Storage rules cannot do at all). So this route does the one relationship
 * check that matters (isAuthorizedToViewProfile, re-derived from the real
 * proposals/invitations/introductions documents every time — never a
 * client-asserted claim) and then reads Storage with the Admin SDK, which
 * bypasses storage.rules entirely, exactly as the admin dashboard's own
 * photo route already does for the same reason.
 */
export async function GET(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  const path = new URL(request.url).searchParams.get("path") ?? "";
  const match = PHOTO_PATH_RE.exec(path);
  if (!match) return NextResponse.json({ ok: false, error: "invalid_path" }, { status: 400 });

  const targetUid = match[1];
  const authorized = await isAuthorizedToViewProfile(auth.uid, targetUid);
  if (!authorized) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });

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
