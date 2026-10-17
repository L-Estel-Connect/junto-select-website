import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { describeError } from "@/lib/admin/describeError";
import {
  ALLOWED_INSTAGRAM_USERNAME,
  GRAPH_VERSION,
  MAX_TEST_REPLIES,
  TEST_KEYWORDS,
  TEST_REPLY_TEXT,
  getInstagramAppId,
  getOAuthRedirectUri,
  getWebhookUrl,
  getWebhookVerifyToken,
  instagramTestEnabled,
} from "@/lib/instagramTest/config";
import { getSubscriptions, listRecentMedia } from "@/lib/instagramTest/graph";
import { FieldValue, deliveriesCol, eventsCol, locksCol, readState, readToken, stateRef } from "@/lib/instagramTest/store";

export const runtime = "nodejs";

function iso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

export async function GET(request: Request) {
  if (!instagramTestEnabled()) return new NextResponse(null, { status: 404 });
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  try {
    let setup: Record<string, string | null>;
    try {
      setup = { appId: getInstagramAppId(), redirectUri: getOAuthRedirectUri(), webhookUrl: getWebhookUrl(), verifyToken: getWebhookVerifyToken(), error: null };
    } catch (error) {
      setup = { appId: null, redirectUri: getOAuthRedirectUri(), webhookUrl: getWebhookUrl(), verifyToken: null, error: (error as Error).message };
    }
    const s = await readState();
    const [events, deliveries, locks] = await Promise.all([
      eventsCol.orderBy("receivedAt", "desc").limit(30).get(),
      deliveriesCol.orderBy("at", "desc").limit(15).get(),
      locksCol.count().get(),
    ]);
    return NextResponse.json({
      ok: true,
      setup: { ...setup, graphVersion: GRAPH_VERSION, allowedUsername: ALLOWED_INSTAGRAM_USERNAME },
      test: { keywords: TEST_KEYWORDS, replyText: TEST_REPLY_TEXT, maxReplies: MAX_TEST_REPLIES },
      state: {
        connected: !!s.token,
        username: s.username ?? null,
        igUserId: s.igUserId ?? null,
        accountType: s.accountType ?? null,
        permissions: s.permissions ?? [],
        tokenExpiresAt: iso(s.tokenExpiresAt),
        connectedAt: iso(s.connectedAt),
        subscribed: s.subscribed ?? false,
        subscribeError: s.subscribeError ?? null,
        mediaId: s.mediaId ?? null,
        mediaPermalink: s.mediaPermalink ?? null,
        mediaCaption: s.mediaCaption ?? null,
        testCommenterUsername: s.testCommenterUsername ?? null,
        sendEnabled: s.sendEnabled ?? false,
        sentCount: s.sentCount ?? 0,
        locks: locks.data().count,
      },
      events: events.docs.map((d) => {
        const e = d.data();
        return {
          commentId: d.id,
          receivedAt: iso(e.receivedAt),
          mediaId: e.mediaId ?? null,
          mediaProductType: e.mediaProductType ?? null,
          fromUsername: e.fromUsername ?? null,
          fromId: e.fromId ?? null,
          text: e.text ?? null,
          parentId: e.parentId ?? null,
          keywordMatched: e.keywordMatched ?? false,
          decision: e.decision ?? null,
          deliveries: e.deliveries ?? 1,
          messageId: e.messageId ?? null,
          error: e.error ?? null,
        };
      }),
      deliveries: deliveries.docs.map((d) => {
        const x = d.data();
        return { at: iso(x.at), signatureValid: !!x.signatureValid, signedWith: x.signedWith ?? null, hasSignature: !!x.hasSignature, object: x.object ?? null, fields: x.fields ?? [], comments: x.comments ?? 0 };
      }),
    });
  } catch (error) {
    console.error("instagram-test state: failed", error);
    return NextResponse.json({ ok: false, error: "failed_to_load", detail: describeError(error) }, { status: 500 });
  }
}

type Action =
  | { action: "select_reel"; mediaId: string }
  | { action: "set_commenter"; username: string }
  | { action: "enable_sending" }
  | { action: "disable_sending" }
  | { action: "check_subscription" }
  | { action: "reset_test" }
  | { action: "disconnect" };

export async function POST(request: Request) {
  if (!instagramTestEnabled()) return new NextResponse(null, { status: 404 });
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const body = (await request.json().catch(() => null)) as Action | null;
  if (!body?.action) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });

  try {
    const s = await readState();
    switch (body.action) {
      case "select_reel": {
        const token = await readToken(s);
        if (!token) return NextResponse.json({ ok: false, error: "not_connected" }, { status: 409 });
        // Only a Reel from the connected account's own media can be chosen.
        const media = (await listRecentMedia(token)).find((m) => m.id === body.mediaId);
        if (!media) return NextResponse.json({ ok: false, error: "reel_not_found" }, { status: 404 });
        await stateRef.set(
          { mediaId: media.id, mediaPermalink: media.permalink ?? null, mediaCaption: media.caption?.slice(0, 200) ?? null, sendEnabled: false, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
        break;
      }
      case "set_commenter": {
        const username = String(body.username ?? "").trim().replace(/^@/, "").toLowerCase();
        if (!/^[a-z0-9._]{1,30}$/.test(username) || username === ALLOWED_INSTAGRAM_USERNAME) {
          return NextResponse.json({ ok: false, error: "invalid_username" }, { status: 400 });
        }
        await stateRef.set({ testCommenterUsername: username, sendEnabled: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        break;
      }
      case "enable_sending": {
        if (!s.token || !s.mediaId || !s.testCommenterUsername) {
          return NextResponse.json({ ok: false, error: "choose_reel_and_commenter_first" }, { status: 409 });
        }
        if ((s.sentCount ?? 0) >= MAX_TEST_REPLIES) return NextResponse.json({ ok: false, error: "cap_reached_reset_first" }, { status: 409 });
        await stateRef.set({ sendEnabled: true, sendEnabledBy: admin.email, sendEnabledAt: FieldValue.serverTimestamp() }, { merge: true });
        break;
      }
      case "disable_sending":
        await stateRef.set({ sendEnabled: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        break;
      case "check_subscription": {
        const token = await readToken(s);
        if (!token) return NextResponse.json({ ok: false, error: "not_connected" }, { status: 409 });
        return NextResponse.json({ ok: true, subscriptions: await getSubscriptions(token) });
      }
      case "reset_test": {
        const locks = await locksCol.get();
        const batch = stateRef.firestore.batch();
        locks.docs.forEach((d) => batch.delete(d.ref));
        batch.set(stateRef, { sentCount: 0, sendEnabled: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await batch.commit();
        break;
      }
      case "disconnect":
        await stateRef.set(
          { token: FieldValue.delete(), tokenExpiresAt: FieldValue.delete(), sendEnabled: false, subscribed: false, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
        break;
      default:
        return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("instagram-test action: failed", body.action, (error as Error)?.message);
    return NextResponse.json({ ok: false, error: "action_failed", detail: describeError(error) }, { status: 500 });
  }
}
