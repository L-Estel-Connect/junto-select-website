import { NextResponse } from "next/server";
import { getInstagramAppSecret, getWebhookVerifyToken, instagramTestEnabled } from "@/lib/instagramTest/config";
import { isValidMetaSignature } from "@/lib/instagramTest/crypto";
import { FieldValue, deliveriesCol } from "@/lib/instagramTest/store";
import { extractCommentChanges, handleComment } from "@/lib/instagramTest/webhook";

export const runtime = "nodejs";

/** Meta's one-time endpoint check: echo hub.challenge when the verify token matches. */
export async function GET(request: Request) {
  if (!instagramTestEnabled()) return new NextResponse(null, { status: 404 });
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
 * Comment notifications. The signature is checked on the raw body before
 * anything is parsed. Meta retries non-200 answers, and every comment is
 * de-duplicated by its id (see handleComment), so a retry is harmless.
 */
export async function POST(request: Request) {
  if (!instagramTestEnabled()) return new NextResponse(null, { status: 404 });
  const rawBody = await request.text();
  const header = request.headers.get("x-hub-signature-256");

  // Meta's docs don't say whether an Instagram Login app signs with the
  // Instagram app secret or the Meta app secret (App settings > Basic), so
  // both are accepted; the delivery log records which one matched.
  let signatureValid = false;
  let signedWith: string | null = null;
  try {
    const candidates: [string, string | undefined][] = [
      ["instagram_app_secret", getInstagramAppSecret()],
      ["meta_app_secret", process.env.INSTAGRAM_TEST_META_APP_SECRET?.trim()],
    ];
    for (const [name, secret] of candidates) {
      if (secret && !secret.startsWith("disabled") && isValidMetaSignature(rawBody, header, secret)) {
        signatureValid = true;
        signedWith = name;
        break;
      }
    }
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
  await deliveriesCol
    .add({ at: FieldValue.serverTimestamp(), signatureValid, signedWith, hasSignature: !!header, object: (Array.isArray(payload) ? payload[0] : (payload as { object?: string } | null))?.object ?? null, fields, comments: comments.length })
    .catch((error) => console.error("instagram-test webhook: could not log delivery", error));

  if (!signatureValid) return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });

  const results: string[] = [];
  for (const comment of comments) {
    try {
      results.push(await handleComment(comment));
    } catch (error) {
      console.error("instagram-test webhook: comment handling failed", (error as Error)?.message);
      results.push("error");
    }
  }
  return NextResponse.json({ ok: true, results });
}
