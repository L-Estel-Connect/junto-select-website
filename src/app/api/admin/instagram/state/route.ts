import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { describeError } from "@/lib/admin/describeError";
import {
  DEFAULT_DAILY_LIMIT,
  MAX_DAILY_LIMIT,
  getAllowedUsername,
  getInstagramAppId,
  getOAuthRedirectUri,
  getWebhookUrl,
  getWebhookVerifyToken,
  validateKeyword,
  validateReplyText,
} from "@/lib/instagram/config";
import { checkAndSync, sendToOneComment } from "@/lib/instagram/automation";
import { madridDay } from "@/lib/instagram/decide";
import { listRecentMedia } from "@/lib/instagram/graph";
import { FieldValue, commentsCol, deliveriesCol, readState, readToken, stateRef, type AutomationStatus } from "@/lib/instagram/store";

export const runtime = "nodejs";

function iso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

const STAT_DECISIONS = ["sent", "send_failed", "dry_run", "before_activation", "repeat_person", "daily_limit", "no_keyword", "own_comment", "too_old"] as const;

export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  try {
    let setup: Record<string, string | null>;
    try {
      setup = { appId: getInstagramAppId(), allowedUsername: getAllowedUsername(), verifyToken: getWebhookVerifyToken(), error: null };
    } catch (error) {
      setup = { appId: null, allowedUsername: null, verifyToken: null, error: (error as Error).message };
    }
    const s = await readState();
    const onReel = s.mediaId ? commentsCol.where("mediaId", "==", s.mediaId) : null;
    const [comments, deliveries, keywordCount, ...decisionCounts] = await Promise.all([
      commentsCol.orderBy("receivedAt", "desc").limit(50).get(),
      deliveriesCol.orderBy("at", "desc").limit(10).get(),
      onReel ? onReel.where("keywordMatched", "==", true).count().get() : null,
      ...STAT_DECISIONS.map((d) => (onReel ? onReel.where("decision", "==", d).count().get() : null)),
    ]);
    const stats: Record<string, number> = { keyword: keywordCount?.data().count ?? 0 };
    STAT_DECISIONS.forEach((d, i) => {
      stats[d] = decisionCounts[i]?.data().count ?? 0;
    });
    const health = (s as { lastHealth?: unknown }).lastHealth ?? null;

    return NextResponse.json({
      ok: true,
      serverTime: new Date().toISOString(),
      setup: { ...setup, redirectUri: getOAuthRedirectUri(), webhookUrl: getWebhookUrl() },
      health,
      state: {
        connected: !!s.token,
        username: s.username ?? null,
        accountType: s.accountType ?? null,
        permissions: s.permissions ?? [],
        tokenExpiresAt: iso(s.tokenExpiresAt),
        connectedAt: iso(s.connectedAt),
        subscribed: s.subscribed ?? false,
        subscribeError: s.subscribeError ?? null,
        mediaId: s.mediaId ?? null,
        mediaPermalink: s.mediaPermalink ?? null,
        mediaCaption: s.mediaCaption ?? null,
        keyword: s.keyword ?? null,
        replyText: s.replyText ?? null,
        status: s.status ?? "off",
        activeSince: iso(s.activeSince),
        dailyLimit: s.dailyLimit ?? DEFAULT_DAILY_LIMIT,
        sentToday: s.dailyDate === madridDay(Date.now()) ? (s.dailyCount ?? 0) : 0,
        sentTotal: s.sentTotal ?? 0,
      },
      stats,
      comments: comments.docs.map((d) => {
        const e = d.data();
        return {
          commentId: d.id,
          receivedAt: iso(e.receivedAt),
          writtenAt: typeof e.writtenAt === "number" ? new Date(e.writtenAt * 1000).toISOString() : null,
          source: e.source ?? null,
          viaWebhook: !!e.viaWebhook,
          mediaId: e.mediaId ?? null,
          fromUsername: e.fromUsername ?? null,
          text: e.text ?? null,
          parentId: e.parentId ?? null,
          keywordMatched: e.keywordMatched ?? false,
          decision: e.decision ?? null,
          sentAt: iso(e.sentAt),
          sentBy: e.sentBy ?? null,
          error: e.error ?? null,
        };
      }),
      deliveries: deliveries.docs.map((d) => {
        const x = d.data();
        return { at: iso(x.at), signatureValid: !!x.signatureValid, hasSignature: !!x.hasSignature, object: x.object ?? null, fields: x.fields ?? [], comments: x.comments ?? 0 };
      }),
    });
  } catch (error) {
    console.error("instagram state: failed", error);
    return NextResponse.json({ ok: false, error: "failed_to_load", detail: describeError(error) }, { status: 500 });
  }
}

type Action =
  | { action: "sync" }
  | { action: "select_reel"; mediaId: string }
  | { action: "save_settings"; keyword: string; replyText: string; dailyLimit?: number }
  | { action: "set_status"; status: AutomationStatus }
  | { action: "send_one"; commentId: string }
  | { action: "disconnect" };

export async function POST(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const body = (await request.json().catch(() => null)) as Action | null;
  if (!body?.action) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });

  try {
    const s = await readState();
    switch (body.action) {
      case "sync":
        return NextResponse.json({ ok: true, health: await checkAndSync() });
      case "select_reel": {
        const token = await readToken(s);
        if (!token) return NextResponse.json({ ok: false, error: "not_connected" }, { status: 409 });
        // Only a Reel from the connected account's own media can be chosen.
        const media = (await listRecentMedia(token)).find((m) => m.id === body.mediaId);
        if (!media) return NextResponse.json({ ok: false, error: "reel_not_found" }, { status: 404 });
        // Changing the Reel always pauses sending, so it can't start on a new Reel unnoticed.
        await stateRef.set(
          {
            mediaId: media.id,
            mediaPermalink: media.permalink ?? null,
            mediaCaption: media.caption?.slice(0, 200) ?? null,
            status: s.status === "active" ? "paused" : (s.status ?? "paused"),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        break;
      }
      case "save_settings": {
        const keyword = validateKeyword(body.keyword);
        const replyText = validateReplyText(body.replyText);
        if (!keyword) return NextResponse.json({ ok: false, error: "invalid_keyword" }, { status: 400 });
        if (!replyText) return NextResponse.json({ ok: false, error: "message_needs_https_link" }, { status: 400 });
        const dailyLimit = Math.min(MAX_DAILY_LIMIT, Math.max(1, Math.floor(Number(body.dailyLimit ?? s.dailyLimit ?? DEFAULT_DAILY_LIMIT)) || DEFAULT_DAILY_LIMIT));
        await stateRef.set({ keyword, replyText, dailyLimit, settingsBy: admin.email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        break;
      }
      case "set_status": {
        const status = body.status;
        if (!["off", "paused", "active"].includes(status)) return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
        if (status === "active" && (!s.token || !s.mediaId || !s.keyword || !s.replyText)) {
          return NextResponse.json({ ok: false, error: "connect_choose_reel_keyword_and_message_first" }, { status: 409 });
        }
        await stateRef.set(
          {
            status,
            // Only comments written from now on get a message.
            ...(status === "active" ? { activeSince: FieldValue.serverTimestamp(), activatedBy: admin.email } : {}),
            statusChangedBy: admin.email,
            statusChangedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        break;
      }
      case "send_one": {
        const result = await sendToOneComment(String(body.commentId ?? ""), admin.email);
        if (result === "not_found" || result === "not_allowed") return NextResponse.json({ ok: false, error: result }, { status: 409 });
        if (result !== "sent") return NextResponse.json({ ok: false, error: result }, { status: 409 });
        return NextResponse.json({ ok: true, result });
      }
      case "disconnect":
        await stateRef.set(
          { token: FieldValue.delete(), tokenExpiresAt: FieldValue.delete(), status: s.status === "off" ? "off" : "paused", subscribed: false, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
        break;
      default:
        return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("instagram action: failed", body.action, (error as Error)?.message);
    return NextResponse.json({ ok: false, error: "action_failed", detail: describeError(error) }, { status: 500 });
  }
}
