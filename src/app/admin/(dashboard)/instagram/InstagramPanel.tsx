"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Badge from "@/components/admin/Badge";
import { AdminError, AdminLoading } from "@/components/admin/States";
import { adminFetchJson } from "@/lib/admin/adminFetch";

type Status = "off" | "paused" | "active";

interface CommentRow {
  commentId: string;
  receivedAt: string | null;
  writtenAt: string | null;
  source: "webhook" | "api" | null;
  viaWebhook: boolean;
  mediaId: string | null;
  fromUsername: string | null;
  text: string | null;
  parentId: string | null;
  keywordMatched: boolean;
  decision: string | null;
  sentAt: string | null;
  sentBy: string | null;
  error: { message?: string; code?: number | null; subcode?: number | null } | null;
}

interface Health {
  checkedAt: string;
  account: { ok: boolean; username?: string; accountType?: string | null; error?: string };
  subscription: { ok: boolean; fields: string[]; error?: string };
  reel: { ok: boolean; permalink?: string | null; commentsCount?: number | null; error?: string };
  apiComments: { ok: boolean; visible: number; error?: string };
}

interface StateResponse {
  serverTime: string;
  setup: { appId: string | null; allowedUsername: string | null; verifyToken: string | null; error: string | null; redirectUri: string; webhookUrl: string };
  health: Health | null;
  state: {
    connected: boolean;
    username: string | null;
    accountType: string | null;
    permissions: string[];
    tokenExpiresAt: string | null;
    subscribed: boolean;
    subscribeError: string | null;
    mediaId: string | null;
    mediaPermalink: string | null;
    mediaCaption: string | null;
    keyword: string | null;
    replyText: string | null;
    status: Status;
    activeSince: string | null;
    dailyLimit: number;
    sentToday: number;
    sentTotal: number;
  };
  stats: Record<string, number>;
  comments: CommentRow[];
  deliveries: { at: string | null; signatureValid: boolean; hasSignature: boolean; object: string | null; fields: string[]; comments: number }[];
}

interface MediaRow {
  id: string;
  caption: string | null;
  productType: string | null;
  permalink: string | null;
  timestamp: string | null;
}

type Tone = "positive" | "warning" | "negative" | "muted" | "neutral";
const DECISIONS: Record<string, { label: string; tone: Tone }> = {
  sent: { label: "Mensaje enviado", tone: "positive" },
  sending: { label: "Enviando…", tone: "neutral" },
  send_failed: { label: "Envío fallido", tone: "negative" },
  dry_run: { label: "Detectado, en pausa (no enviado)", tone: "warning" },
  before_activation: { label: "Anterior a la activación (no enviado)", tone: "muted" },
  repeat_person: { label: "Ya recibió el mensaje", tone: "muted" },
  daily_limit: { label: "Límite diario alcanzado", tone: "negative" },
  no_keyword: { label: "Sin palabra clave", tone: "muted" },
  own_comment: { label: "Comentario de la propia cuenta", tone: "muted" },
  too_old: { label: "Más de 7 días", tone: "muted" },
  not_configured: { label: "Falta el mensaje", tone: "negative" },
};

const STATUS: Record<Status, { label: string; tone: Tone; help: string }> = {
  active: { label: "Activa", tone: "positive", help: "Envía el mensaje a cada nuevo comentario con la palabra clave." },
  paused: { label: "En pausa", tone: "warning", help: "Detecta y registra los comentarios, pero no envía nada." },
  off: { label: "Desactivada", tone: "muted", help: "No detecta ni registra comentarios." },
};

const ELIGIBLE_FOR_MANUAL = new Set(["dry_run", "before_activation", "send_failed", "daily_limit"]);

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("https://") ? (
          <a key={i} className="underline" href={p} target="_blank" rel="noreferrer">{p}</a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default function InstagramPanel() {
  const result = useSearchParams().get("result");
  const [data, setData] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaRow[] | null>(null);
  const [keyword, setKeyword] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  // "Actualizar" first checks the Instagram API directly (and picks up any
  // comment the webhook missed), then re-reads everything. It shows that
  // it's working, when it last succeeded, and any error, while keeping the
  // last good data on screen.
  const fetchState = useCallback(() => {
    adminFetchJson("/api/admin/instagram/state", { method: "POST", body: JSON.stringify({ action: "sync" }) })
      .catch(() => null)
      .then(() => adminFetchJson<StateResponse>("/api/admin/instagram/state"))
      .then((res) => {
        setData(res);
        setError(null);
        setLoadedAt(res.serverTime);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  function reload() {
    setLoading(true);
    fetchState();
  }

  async function act(body: Record<string, unknown>, success?: string): Promise<boolean> {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await adminFetchJson("/api/admin/instagram/state", { method: "POST", body: JSON.stringify(body) });
      if (success) setNotice(success);
      reload();
      return true;
    } catch (e) {
      const message = (e as Error).message;
      const known = Object.keys(DECISIONS).find((k) => message.includes(k));
      setActionError(known ? `No enviado: ${DECISIONS[known].label}` : message);
      reload();
      return false;
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function loadMedia() {
    setActionError(null);
    try {
      const res = await adminFetchJson<{ media: MediaRow[] }>("/api/admin/instagram/reels");
      setMedia(res.media);
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  if (!data) return error ? <AdminError message={`No se pudo cargar: ${error}`} /> : <AdminLoading />;
  const { setup, state, stats, comments, deliveries, health } = data;
  const kw = keyword ?? state.keyword ?? "SELECT";
  const msg = replyText ?? state.replyText ?? "";
  const limit = dailyLimit ?? String(state.dailyLimit);
  const settingsDirty = kw !== (state.keyword ?? "") || msg !== (state.replyText ?? "") || limit !== String(state.dailyLimit);
  const canActivate = state.connected && !!state.mediaId && !!state.keyword && !!state.replyText && !settingsDirty;
  const hiddenComments = health?.reel.ok && health.apiComments.ok && (health.reel.commentsCount ?? 0) > health.apiComments.visible;

  const card = "rounded-2xl border border-hairline bg-white p-6";
  const btn = "rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper disabled:opacity-40";
  const ghost = "rounded-full border border-hairline px-4 py-2 text-[13px] font-medium text-ink hover:border-rose disabled:opacity-40";
  const input = "w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-[13px]";

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-ink-soft">Instagram</p>
        <h1 className="mt-1 font-serif text-[30px] font-light text-ink">Respuestas automáticas a comentarios</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          Cuando alguien comenta la palabra clave en el Reel elegido, @{setup.allowedUsername ?? "—"} le envía un mensaje privado con tu enlace.
          Una sola vez por persona y por Reel.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className={btn} disabled={loading} onClick={reload}>{loading ? "Actualizando…" : "Actualizar"}</button>
          <span className="text-[12px] text-ink-soft" aria-live="polite">
            {loading ? "Comprobando Instagram y leyendo los comentarios…" : loadedAt ? `Actualizado a las ${new Date(loadedAt).toLocaleTimeString("es-ES")}` : ""}
          </span>
        </div>
        {error && <div className="mt-3"><AdminError message={`La última actualización falló: ${error}`} /></div>}
        {result && <p className="mt-3 text-[13px] text-ink">Resultado de la conexión: <code>{result}</code></p>}
        {notice && <p className="mt-3 text-[13px] text-ink">{notice}</p>}
        {actionError && <div className="mt-3"><AdminError message={actionError} /></div>}
      </div>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-medium text-ink">Cuenta de Instagram</h2>
          {state.connected ? <Badge tone="positive">Conectada: @{state.username}</Badge> : <Badge tone="muted">Sin conectar</Badge>}
        </div>
        {setup.error && <p className="mt-2 text-[13px] text-[#8a3b3b]">Falta configuración del servidor: {setup.error}</p>}
        {state.connected && health && (
          <ul className="mt-3 space-y-1 text-[13px] text-ink">
            <li>Conexión: {health.account.ok ? `correcta (${health.account.accountType ?? "?"})` : `error: ${health.account.error}`}</li>
            <li>Avisos de comentarios (webhook): {health.subscription.error ? `error: ${health.subscription.error}` : health.subscription.ok ? "suscritos" : "no suscritos"}</li>
            <li>Permisos: {state.permissions.join(", ") || "—"} · Caduca: {fmt(state.tokenExpiresAt)}</li>
            {health.reel.ok && (
              <li>Reel elegido: {health.reel.commentsCount ?? "?"} comentarios según Instagram, {health.apiComments.ok ? `${health.apiComments.visible} visibles para la app` : `error: ${health.apiComments.error}`}</li>
            )}
          </ul>
        )}
        {hiddenComments && (
          <p className="mt-3 rounded-xl bg-rose-tint px-4 py-3 text-[13px] leading-relaxed text-ink">
            Instagram cuenta más comentarios de los que deja ver a la app. Meta los retiene mientras la app no esté publicada (modo Live) con el acceso necesario.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <a className={btn} href="/api/admin/instagram/connect">{state.connected ? "Volver a conectar" : `Conectar @${setup.allowedUsername ?? "Instagram"}`}</a>
          {state.connected && <button className={ghost} disabled={busy} onClick={() => act({ action: "disconnect" })}>Desconectar</button>}
        </div>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-medium text-ink">Automatización</h2>
          <Badge tone={STATUS[state.status].tone}>{STATUS[state.status].label}</Badge>
        </div>
        <p className="mt-1 text-[12px] text-ink-soft">{STATUS[state.status].help}</p>

        <h3 className="mt-5 text-[13px] font-medium text-ink">Reel</h3>
        <p className="mt-1 text-[13px] text-ink">
          {state.mediaId ? <a className="underline" href={state.mediaPermalink ?? "#"} target="_blank" rel="noreferrer">{state.mediaCaption || state.mediaPermalink}</a> : "Sin elegir"}
        </p>
        <button className={`${ghost} mt-2`} disabled={!state.connected} onClick={loadMedia}>Elegir entre mis Reels</button>
        {media && (
          <ul className="mt-3 divide-y divide-hairline rounded-xl border border-hairline">
            {media.filter((m) => m.productType === "REELS").length === 0 && <li className="px-4 py-3 text-[13px] text-ink-soft">No hay Reels recientes.</li>}
            {media.filter((m) => m.productType === "REELS").map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="text-ink-soft">{m.timestamp?.slice(0, 10)}</span>
                  <br />
                  <a className="underline" href={m.permalink ?? "#"} target="_blank" rel="noreferrer">{m.caption || m.permalink}</a>
                </span>
                <button className={ghost} disabled={busy || m.id === state.mediaId} onClick={() => act({ action: "select_reel", mediaId: m.id }, "Reel guardado.")}>
                  {m.id === state.mediaId ? "Elegido" : "Elegir"}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_140px]">
          <label className="block text-[13px] text-ink">
            Palabra clave
            <input className={`${input} mt-1`} value={kw} onChange={(e) => setKeyword(e.target.value)} maxLength={40} />
            <span className="mt-1 block text-[12px] text-ink-soft">Sin distinguir mayúsculas ni acentos: «select», «Select!» y «SELECT» cuentan.</span>
          </label>
          <label className="block text-[13px] text-ink">
            Máximo al día
            <input className={`${input} mt-1`} inputMode="numeric" value={limit} onChange={(e) => setDailyLimit(e.target.value.replace(/\D/g, ""))} />
          </label>
        </div>
        <label className="mt-4 block text-[13px] text-ink">
          Mensaje privado (debe incluir un enlace https://)
          <textarea className={`${input} mt-1 min-h-[96px]`} value={msg} onChange={(e) => setReplyText(e.target.value)} maxLength={900} />
        </label>
        {msg && (
          <p className="mt-2 rounded-xl bg-rose-tint px-4 py-3 text-[13px] leading-relaxed text-ink"><Linkified text={msg} /></p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={ghost}
            disabled={busy || !settingsDirty}
            onClick={() => act({ action: "save_settings", keyword: kw, replyText: msg, dailyLimit: Number(limit) }, "Ajustes guardados.").then((ok) => {
              if (!ok) return;
              setKeyword(null);
              setReplyText(null);
              setDailyLimit(null);
            })}
          >
            Guardar ajustes
          </button>
        </div>

        <h3 className="mt-6 text-[13px] font-medium text-ink">Estado</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {state.status !== "active" && confirm !== "activate" && (
            <button className={btn} disabled={busy || !canActivate} onClick={() => setConfirm("activate")}>Activar</button>
          )}
          {confirm === "activate" && (
            <span className="flex flex-wrap items-center gap-2 rounded-xl bg-rose-tint px-4 py-3 text-[13px] text-ink">
              Se enviará el mensaje a cada nuevo comentario con «{state.keyword}» en este Reel. Desactiva antes cualquier automatización de ManyChat en el mismo Reel.
              <button className={btn} disabled={busy} onClick={() => act({ action: "set_status", status: "active" }, "Automatización activada.")}>Sí, activar</button>
              <button className={ghost} onClick={() => setConfirm(null)}>Cancelar</button>
            </span>
          )}
          {state.status !== "paused" && <button className={ghost} disabled={busy} onClick={() => act({ action: "set_status", status: "paused" }, "Automatización en pausa.")}>Pausar</button>}
          {state.status !== "off" && <button className={ghost} disabled={busy} onClick={() => act({ action: "set_status", status: "off" }, "Automatización desactivada.")}>Desactivar</button>}
        </div>
        {!canActivate && state.status !== "active" && (
          <p className="mt-2 text-[12px] text-ink-soft">Para activar: conecta la cuenta, elige un Reel y guarda la palabra clave y el mensaje.</p>
        )}
        {state.status === "active" && state.activeSince && <p className="mt-2 text-[12px] text-ink-soft">Activa desde {fmt(state.activeSince)}. Los comentarios anteriores no reciben mensaje.</p>}
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">Estadísticas del Reel</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Con palabra clave", stats.keyword ?? 0],
            ["Mensajes enviados", stats.sent ?? 0],
            ["Envíos fallidos", stats.send_failed ?? 0],
            ["Enviados hoy", `${state.sentToday} / ${state.dailyLimit}`],
            ["Detectados en pausa", stats.dry_run ?? 0],
            ["Ya lo habían recibido", stats.repeat_person ?? 0],
            ["Sin palabra clave", stats.no_keyword ?? 0],
            ["Total enviados (todos los Reels)", state.sentTotal],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-hairline px-4 py-3">
              <dt className="text-[12px] text-ink-soft">{label}</dt>
              <dd className="mt-1 text-[20px] font-light text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">Comentarios detectados</h2>
        <p className="mt-1 text-[12px] text-ink-soft">
          Llegan por el aviso de Meta (webhook) y, como respaldo, se leen de Instagram en cada actualización. Un comentario detectado dos veces solo cuenta una.
        </p>
        {comments.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-soft">Todavía no hay comentarios en el Reel elegido.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {comments.map((c) => {
              const d = DECISIONS[c.decision ?? ""] ?? { label: c.decision ?? "—", tone: "neutral" as const };
              const canSend = ELIGIBLE_FOR_MANUAL.has(c.decision ?? "") && c.keywordMatched && c.mediaId === state.mediaId && !!state.replyText;
              return (
                <li key={c.commentId} className="rounded-xl border border-hairline px-4 py-3 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-ink">@{c.fromUsername ?? "?"}: «{c.text ?? ""}»</span>
                    <Badge tone={d.tone}>{d.label}</Badge>
                  </div>
                  <p className="mt-1 text-[12px] text-ink-soft">
                    {fmt(c.writtenAt ?? c.receivedAt)} · {c.viaWebhook ? "aviso de Meta" : "leído de Instagram"}
                    {c.parentId ? " · respuesta a otro comentario" : ""}
                    {c.sentAt ? ` · enviado ${fmt(c.sentAt)}${c.sentBy && c.sentBy !== "automation" ? ` por ${c.sentBy}` : ""}` : ""}
                  </p>
                  {c.error && <p className="mt-1 text-[12px] text-[#8a3b3b]">Error de Meta: {c.error.message}</p>}
                  {canSend && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {confirm === c.commentId ? (
                        <>
                          <span className="text-[12px] text-ink">¿Enviar el mensaje solo a @{c.fromUsername}?</span>
                          <button className={btn} disabled={busy} onClick={() => act({ action: "send_one", commentId: c.commentId }, "Mensaje enviado.")}>Sí, enviar</button>
                          <button className={ghost} onClick={() => setConfirm(null)}>Cancelar</button>
                        </>
                      ) : (
                        <button className={ghost} disabled={busy} onClick={() => setConfirm(c.commentId)}>
                          {c.decision === "send_failed" ? "Reintentar el envío" : "Enviar el mensaje a esta persona"}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details className={card}>
        <summary className="cursor-pointer text-[15px] font-medium text-ink">Configuración técnica de Meta</summary>
        <dl className="mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-ink-soft">URL de redirección OAuth</dt><dd className="break-all font-mono">{setup.redirectUri}</dd>
          <dt className="text-ink-soft">URL de devolución (webhook)</dt><dd className="break-all font-mono">{setup.webhookUrl}</dd>
          <dt className="text-ink-soft">Token de verificación</dt><dd className="break-all font-mono">{setup.verifyToken ?? "—"}</dd>
          <dt className="text-ink-soft">Instagram app ID</dt><dd className="font-mono">{setup.appId ?? "—"}</dd>
        </dl>
        <h3 className="mt-5 text-[13px] font-medium text-ink">Últimos avisos recibidos de Meta</h3>
        {deliveries.length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-soft">Ninguno todavía.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-[12px] text-ink-soft">
            {deliveries.map((d, i) => (
              <li key={i}>{fmt(d.at)} · firma {d.signatureValid ? "válida" : d.hasSignature ? "NO válida" : "ausente"} · campos {d.fields.join(", ") || "—"} · comentarios {d.comments}</li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
