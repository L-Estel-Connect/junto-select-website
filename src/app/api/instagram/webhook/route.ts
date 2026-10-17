import { NextResponse } from "next/server";
import { getInstagramAppSecret, getWebhookVerifyToken } from "@/lib/instagram/config";
import { handleComment } from "@/lib/instagram/automation";
import { isValidMetaSignature } from "@/lib/instagram/crypto";
import { extractCommentChanges } from "@/lib/instagram/decide";
import { FieldValue, deliveriesCol } from "@/lib/instagram/store";

export const runtime = "nodejs";

/** Meta's one-time endpoint check: echo hub.challenge when the verify token matches. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let expected: string;
  try {
    expected = getWebhookVerifyToken();
  } catch {
    return new NextResponse("not_configured", { status: 503 });
  }
  if (params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expected) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/**
 * Comment notifications. The signature (Instagram app secret) is checked on
 * the raw body before anything is parsed. Meta retries non-200 answers, and
 * every comment is de-duplicated by its id, so a retry is harmless.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const header = request.headers.get("x-hub-signature-256");
  let signatureValid: boolean;
  try {
    signatureValid = isValidMetaSignature(rawBody, header, getInstagramAppSecret());
  } catch {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  let payload: unknown = null;
  if (signatureValid) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = null;
    }
  }
  const { comments, fields } = extractCommentChanges(payload);
  const results: string[] = [];
  if (signatureValid) {
    for (const comment of comments) {
      try {
        results.push(await handleComment(comment, "webhook"));
      } catch (error) {
        console.error("instagram webhook: comment handling failed", (error as Error)?.message);
        results.push("error");
      }
    }
  }
  await deliveriesCol
    .add({
      at: FieldValue.serverTimestamp(),
      signatureValid,
      hasSignature: !!header,
      object: (Array.isArray(payload) ? payload[0] : (payload as { object?: string } | null))?.object ?? null,
      fields,
      comments: comments.length,
      results,
    })
    .catch((error) => console.error("instagram webhook: could not log delivery", error));

  if (!signatureValid) return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
