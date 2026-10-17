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
import { checkAndSync, migrateLegacyState, relabelAutomation, sendToOneComment } from "@/lib/instagram/automation";
import { madridDay } from "@/lib/instagram/decide";
import { listRecentMedia } from "@/lib/instagram/graph";
import {
  FieldValue,
  automationsCol,
  commentsCol,
  deliveriesCol,
  readState,
  readToken,
  stateRef,
  type Automation,
  type AutomationStatus,
} from "@/lib/instagram/store";

export const runtime = "nodejs";

function iso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

const STAT_DECISIONS = ["sent", "send_failed", "dry_run", "before_activation", "historical"] as const;
const COMMENTS_LIMIT = 1000;

async function automationStats(mediaId: string) {
  const onReel = commentsCol.where("mediaId", "==", mediaId);
  const counts = await Promise.all(STAT_DECISIONS.map((d) => onReel.where("decision", "==", d).count().get()));
  return Object.fromEntries(STAT_DECISIONS.map((d, i) => [d, counts[i].data().count]));
}

export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  try {
    await migrateLegacyState(admin.email);
    let setup: Record<string, string | null>;
    try {
      setup = { appId: getInstagramAppId(), allowedUsername: getAllowedUsername(), verifyToken: getWebhookVerifyToken(), error: null };
    } catch (error) {
      setup = { appId: null, allowedUsername: null, verifyToken: null, error: (error as Error).message };
    }
    const s = await readState();
    const selected = new URL(request.url).searchParams.get("automation");
    const [autos, deliveries] = await Promise.all([automationsCol.get(), deliveriesCol.orderBy("at", "desc").limit(10).get()]);
    const automations = await Promise.all(
      autos.docs.map(async (d) => {
        const a = d.data() as Automation;
        return {
          id: d.id,
          mediaId: a.mediaId,
          mediaPermalink: a.mediaPermalink ?? null,
          mediaCaption: a.mediaCaption ?? null,
          keyword: a.keyword ?? null,
          replyText: a.replyText ?? null,
          status: a.status,
          createdAt: iso(a.createdAt),
          activeSince: iso(a.activeSince),
          stats: await automationStats(a.mediaId),
        };
      }),
    );
    automations.sort((x, y) => (y.createdAt ?? "").localeCompare(x.createdAt ?? ""));

    let comments = null;
    const chosen = automations.find((a) => a.id === selected);
    if (chosen) {
      const snap = await commentsCol.where("mediaId", "==", chosen.mediaId).limit(COMMENTS_LIMIT).get();
      comments = snap.docs
        .map((d) => {
          const e = d.data();
          return {
            commentId: d.id,
            receivedAt: iso(e.receivedAt),
            writtenAt: typeof e.writtenAt === "number" ? new Date(e.writtenAt * 1000).toISOString() : null,
            viaWebhook: !!e.viaWebhook,
            fromUsername: e.fromUsername ?? null,
            text: e.text ?? null,
            parentId: e.parentId ?? null,
            keywordMatched: e.keywordMatched ?? false,
            historical: e.historical ?? false,
            decision: e.decision ?? null,
            sentAt: iso(e.sentAt),
            sentBy: e.sentBy ?? null,
            error: e.error ?? null,
          };
        })
        .sort((x, y) => (y.writtenAt ?? y.receivedAt ?? "").localeCompare(x.writtenAt ?? x.receivedAt ?? ""));
    }

    return NextResponse.json({
      ok: true,
      serverTime: new Date().toISOString(),
      setup: { ...setup, redirectUri: getOAuthRedirectUri(), webhookUrl: getWebhookUrl() },
      health: (s as { lastHealth?: unknown }).lastHealth ?? null,
      account: {
        connected: !!s.token,
        username: s.username ?? null,
        accountType: s.accountType ?? null,
        permissions: s.permissions ?? [],
        tokenExpiresAt: iso(s.tokenExpiresAt),
        subscribed: s.subscribed ?? false,
        subscribeError: s.subscribeError ?? null,
        dailyLimit: s.dailyLimit ?? DEFAULT_DAILY_LIMIT,
        sentToday: s.dailyDate === madridDay(Date.now()) ? (s.dailyCount ?? 0) : 0,
        sentTotal: s.sentTotal ?? 0,
      },
      automations,
      comments,
      deliveries: deliveries.docs.map((d) => {
        const x = d.data();
        return { at: iso(x.at), signatureValid: !!x.signatureValid, hasSignature: !!x.hasSignature, fields: x.fields ?? [], comments: x.comments ?? 0 };
      }),
    });
  } catch (error) {
    console.error("instagram state: failed", error);
    return NextResponse.json({ ok: false, error: "failed_to_load", detail: describeError(error) }, { status: 500 });
  }
}

type Action =
  | { action: "sync" }
  | { action: "create_automation"; mediaId: string; keyword: string; replyText: string }
  | { action: "update_automation"; id: string; keyword: string; replyText: string }
  | { action: "set_status"; id: string; status: AutomationStatus; keyword?: string; replyText?: string }
  | { action: "delete_automation"; id: string }
  | { action: "send_one"; commentId: string }
  | { action: "set_daily_limit"; dailyLimit: number }
  | { action: "disconnect" };

export async function POST(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const body = (await request.json().catch(() => null)) as Action | null;
  if (!body?.action) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });

  try {
    await migrateLegacyState(admin.email);
    const s = await readState();
    switch (body.action) {
      case "sync":
        return NextResponse.json({ ok: true, health: await checkAndSync() });

      case "create_automation": {
        const keyword = validateKeyword(body.keyword);
        const replyText = validateReplyText(body.replyText);
        if (!keyword) return NextResponse.json({ ok: false, error: "invalid_keyword" }, { status: 400 });
        if (!replyText) return NextResponse.json({ ok: false, error: "message_needs_https_link" }, { status: 400 });
        const token = await readToken(s);
        if (!token) return NextResponse.json({ ok: false, error: "not_connected" }, { status: 409 });
        // Only a Reel from the connected account's own media, and one automation per Reel.
        const media = (await listRecentMedia(token)).find((m) => m.id === body.mediaId);
        if (!media) return NextResponse.json({ ok: false, error: "reel_not_found" }, { status: 404 });
        const ref = automationsCol.doc();
        const created = await stateRef.firestore.runTransaction(async (tx) => {
          const dup = await tx.get(automationsCol.where("mediaId", "==", media.id).limit(1));
          if (!dup.empty) return false;
          tx.set(ref, {
            mediaId: media.id,
            mediaPermalink: media.permalink ?? null,
            mediaCaption: media.caption?.slice(0, 200) ?? null,
            keyword,
            replyText,
            status: "paused",
            createdAt: FieldValue.serverTimestamp(),
            createdBy: admin.email,
            activeSince: null,
            updatedAt: FieldValue.serverTimestamp(),
          });
          return true;
        });
        if (!created) return NextResponse.json({ ok: false, error: "reel_already_has_automation" }, { status: 409 });
        await relabelAutomation(ref.id);
        return NextResponse.json({ ok: true, id: ref.id });
      }

      case "update_automation": {
        const keyword = validateKeyword(body.keyword);
        const replyText = validateReplyText(body.replyText);
        if (!keyword) return NextResponse.json({ ok: false, error: "invalid_keyword" }, { status: 400 });
        if (!replyText) return NextResponse.json({ ok: false, error: "message_needs_https_link" }, { status: 400 });
        const ref = automationsCol.doc(String(body.id));
        const snap = await ref.get();
        if (!snap.exists) return NextResponse.json({ ok: false, error: "automation_not_found" }, { status: 404 });
        const a = snap.data() as Automation;
        const changed = a.keyword !== keyword || a.replyText !== replyText;
        // Editing an active automation pauses it, so it never sends with settings nobody re-confirmed.
        await ref.update({ keyword, replyText, ...(changed && a.status === "active" ? { status: "paused" } : {}), updatedBy: admin.email, updatedAt: FieldValue.serverTimestamp() });
        await relabelAutomation(ref.id);
        return NextResponse.json({ ok: true, paused: changed && a.status === "active" });
      }

      case "set_status": {
        const status = body.status;
        if (!["off", "paused", "active"].includes(status)) return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
        const ref = automationsCol.doc(String(body.id));
        const snap = await ref.get();
        if (!snap.exists) return NextResponse.json({ ok: false, error: "automation_not_found" }, { status: 404 });
        const a = snap.data() as Automation;
        if (status === "active") {
          if (!s.token || !a.keyword || !a.replyText) return NextResponse.json({ ok: false, error: "connect_and_set_keyword_and_message_first" }, { status: 409 });
          // The admin confirmed a keyword and message on screen: activate only if they are exactly the saved ones.
          if (body.keyword !== a.keyword || body.replyText !== a.replyText) return NextResponse.json({ ok: false, error: "settings_changed_reload" }, { status: 409 });
        }
        await ref.update({
          status,
          // Only comments written from now on get a message.
          ...(status === "active" && a.status !== "active" ? { activeSince: FieldValue.serverTimestamp(), activatedBy: admin.email } : {}),
          statusChangedBy: admin.email,
          statusChangedAt: FieldValue.serverTimestamp(),
        });
        await relabelAutomation(ref.id);
        break;
      }

      case "delete_automation": {
        const ref = automationsCol.doc(String(body.id));
        const snap = await ref.get();
        if (!snap.exists) return NextResponse.json({ ok: false, error: "automation_not_found" }, { status: 404 });
        if ((snap.data() as Automation).status === "active") return NextResponse.json({ ok: false, error: "pause_before_deleting" }, { status: 409 });
        // Only the settings go; the Reel's comment records and sent history stay.
        await ref.delete();
        break;
      }

      case "send_one": {
        const result = await sendToOneComment(String(body.commentId ?? ""), admin.email);
        if (result !== "sent") return NextResponse.json({ ok: false, error: result }, { status: 409 });
        return NextResponse.json({ ok: true, result });
      }

      case "set_daily_limit": {
        const dailyLimit = Math.floor(Number(body.dailyLimit));
        if (!(dailyLimit >= 1 && dailyLimit <= MAX_DAILY_LIMIT)) return NextResponse.json({ ok: false, error: "invalid_daily_limit" }, { status: 400 });
        await stateRef.set({ dailyLimit, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        break;
      }

      case "disconnect": {
        // Disconnecting pauses every active automation.
        const active = await automationsCol.where("status", "==", "active").get();
        const batch = stateRef.firestore.batch();
        active.docs.forEach((d) => batch.update(d.ref, { status: "paused" }));
        batch.set(stateRef, { token: FieldValue.delete(), tokenExpiresAt: FieldValue.delete(), subscribed: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await batch.commit();
        break;
      }

      default:
        return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("instagram action: failed", body.action, (error as Error)?.message);
    return NextResponse.json({ ok: false, error: "action_failed", detail: describeError(error) }, { status: 500 });
  }
}
