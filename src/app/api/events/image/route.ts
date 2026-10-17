import { NextResponse } from "next/server";
import { getAdminStorageBucket } from "@/lib/firebase/admin";

export const runtime = "nodejs";

// Only uploaded event images: events/{eventId}/{timestamp}.{ext}.
const PATH_RE = /^events\/[A-Za-z0-9_-]+\/\d+\.(jpg|png|webp)$/;
const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

/**
 * Serves an uploaded event image publicly (event images are public by
 * nature). Streamed through the server rather than a Storage download URL,
 * the same pattern as profile photos, so storage.rules stay default-deny.
 */
export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path") ?? "";
  const match = PATH_RE.exec(path);
  if (!match) return NextResponse.json({ ok: false, error: "invalid_path" }, { status: 400 });
  try {
    const [bytes] = await getAdminStorageBucket().file(path).download();
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": TYPES[match[1] as keyof typeof TYPES],
        // Each upload gets a new path, so the bytes at a path never change.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}
