import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { getAdminStorageBucket } from "@/lib/firebase/admin";
import { UPLOADED_IMAGE_PREFIX } from "@/lib/events/editing";

export const runtime = "nodejs";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Uploads an event-specific image (multipart field `file`) to Storage under
 * events/{eventId}/. Returns the public URL to put in the event's image
 * field; the event itself only changes when the admin saves the form.
 */
export async function POST(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const eventId = String(form?.get("eventId") ?? "new").replace(/[^A-Za-z0-9_-]/g, "") || "new";
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "no_file: Elige una imagen." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ ok: false, error: "bad_type: La imagen debe ser JPG, PNG o WebP." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "too_large: La imagen debe pesar menos de 5 MB." }, { status: 400 });

  const path = `events/${eventId}/${Date.now()}.${ext}`;
  await getAdminStorageBucket()
    .file(path)
    .save(Buffer.from(await file.arrayBuffer()), { contentType: file.type, resumable: false });
  return NextResponse.json({ ok: true, url: `${UPLOADED_IMAGE_PREFIX}${path}` });
}
