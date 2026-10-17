"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Badge from "@/components/admin/Badge";
import { AdminError, AdminLoading } from "@/components/admin/States";
import { adminFetchJson } from "@/lib/admin/adminFetch";

type Status = "off" | "paused" | "active";
type Tone = "positive" | "warning" | "negative" | "muted" | "neutral";

interface AutomationRow {
  id: string;
  mediaId: string;
  mediaPermalink: string | null;
  mediaCaption: string | null;
  keyword: string | null;
  replyText: string | null;
  status: Status;
  createdAt: string | null;
  activeSince: string | null;
  stats: Record<string, number>;
}

interface CommentRow {
  commentId: string;
  receivedAt: string | null;
  writtenAt: string | null;
  viaWebhook: boolean;
  fromUsername: string | null;
  text: string | null;
  parentId: string | null;
  keywordMatched: boolean;
  historical: boolean;
  decision: string | null;
  sentAt: string | null;
  sentBy: string | null;
  error: { message?: string } | null;
}

interface Health {
  checkedAt: string;
  account: { ok: boolean; username?: string; accountType?: string | null; error?: string };
  subscription: { ok: boolean; fields: string[]; error?: string };
  reels: Record<string, { ok: boolean; commentsCount?: number | null; visible?: number; error?: string }>;
}

interface StateResponse {
  serverTime: string;
  setup: { appId: string | null; allowedUsername: string | null; verifyToken: string | null; error: string | null; redirectUri: string; webhookUrl: string };
  health: Health | null;
  account: {
    connected: boolean;
    username: string | null;
    accountType: string | null;
    permissions: string[];
    tokenExpiresAt: string | null;
    subscribed: boolean;
    subscribeError: string | null;
    dailyLimit: number;
    sentToday: number;
    sentTotal: number;
  };
  automations: AutomationRow[];
  comments: CommentRow[] | null;
  deliveries: { at: string | null; signatureValid: boolean; hasSignature: boolean; fields: string[]; comments: number }[];
}

interface MediaRow {
  id: string;
  caption: string | null;
  productType: string | null;
  permalink: string | null;
  timestamp: string | null;
}

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  active: { label: "Activa", tone: "positive" },
  paused: { label: "En pausa", tone: "warning" },
  off: { label: "Desactivada", tone: "muted" },
};

const DECISIONS: Record<string, { label: string; tone: Tone }> = {
  sent: { label: "Enviado", tone: "positive" },
  sending: { label: "Enviando…", tone: "neutral" },
  send_failed: { label: "Error de envío", tone: "negative" },
  dry_run: { label: "Nuevo · en pausa", tone: "warning" },
  before_activation: { label: "Nuevo · antes de activar", tone: "warning" },
  historical: { label: "Histórico", tone: "muted" },
  repeat_person: { label: "Ya recibió el mensaje", tone: "muted" },
  daily_limit: { label: "Límite diario alcanzado", tone: "negative" },
  no_keyword: { label: "Sin palabra clave", tone: "muted" },
  own_comment: { label: "Comentario propio", tone: "muted" },
  too_old: { label: "Más de 7 días", tone: "muted" },
  not_configured: { label: "Falta el mensaje", tone: "negative" },
};

const MANUALLY_SENDABLE = new Set(["historical", "dry_run", "before_activation", "send_failed", "daily_limit"]);

const ERRORS: Record<string, string> = {
  reel_already_has_automation: "Este Reel ya tiene una automatización.",
  settings_changed_reload: "La palabra clave o el mensaje han cambiado. Actualiza la página y vuelve a activar.",
  message_needs_https_link: "El mensaje debe incluir un enlace que empiece por https://.",
  invalid_keyword: "Escribe una palabra clave.",
  pause_before_deleting: "Pausa la automatización antes de eliminarla.",
  not_connected: "Conecta primero la cuenta de Instagram.",
  repeat_person: "No enviado: esta persona ya recibió el mensaje.",
  daily_limit: "No enviado: se ha alcanzado el límite diario.",
  not_allowed: "Este comentario ya no admite envío (más de 7 días o ya enviado).",
  send_failed: "Meta rechazó el envío. El error aparece en el comentario.",
};

const FILTERS = [
  { key: "keyword", label: "Con palabra clave" },
  { key: "new", label: "Nuevos" },
  { key: "historical", label: "Históricos" },
  { key: "sent", label: "Enviados" },
  { key: "errors", label: "Errores" },
  { key: "all", label: "Todos" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];
const PAGE_SIZE = 15;

const card = "rounded-2xl border border-hairline bg-white p-5";
const btn = "rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper disabled:opacity-40";
const ghost = "rounded-full border border-hairline px-4 py-2 text-[13px] font-medium text-ink hover:border-rose disabled:opacity-40";
const link = "text-[13px] font-medium text-ink underline decoration-hairline underline-offset-4 hover:decoration-rose disabled:opacity-40";
const input = "w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-[13px]";

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function message(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const key = Object.keys(ERRORS).find((k) => m.startsWith(k));
  return key ? ERRORS[key] : m;
}

function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https:\/\/[^\s]+)/g).map((p, i) =>
        p.startsWith("https://") ? (
          <a key={i} className="underline" href={p} target="_blank" rel="noreferrer">{p}</a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function reelTitle(a: { mediaCaption: string | null; mediaPermalink: string | null; mediaId: string }) {
  const caption = a.mediaCaption?.split("\n")[0]?.trim();
  return caption || (a.mediaPermalink ? "Reel sin texto" : `Reel ${a.mediaId}`);
}

export default function InstagramPanel() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selectedId = params.get("automation");
  const result = params.get("result");

  const [data, setData] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ id: string | null; mediaId: string; keyword: string; replyText: string } | null>(null);
  const [media, setMedia] = useState<MediaRow[] | null>(null);

  // Every load first checks Instagram directly (and picks up any comment
  // the webhook missed), then re-reads everything.
  const fetchState = useCallback(() => {
    const qs = selectedId ? `?automation=${encodeURIComponent(selectedId)}` : "";
    adminFetchJson("/api/admin/instagram/state", { method: "POST", body: JSON.stringify({ action: "sync" }) })
      .catch(() => null)
      .then(() => adminFetchJson<StateResponse>(`/api/admin/instagram/state${qs}`))
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  function reload() {
    setLoading(true);
    fetchState();
  }

  function open(id: string | null) {
    setConfirm(null);
    setEditor(null);
    router.push(id ? `${pathname}?automation=${encodeURIComponent(id)}` : pathname);
  }

  async function act(body: Record<string, unknown>, success?: string): Promise<boolean> {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await adminFetchJson("/api/admin/instagram/state", { method: "POST", body: JSON.stringify(body) });
      if (success) setNotice(success);
      return true;
    } catch (e) {
      setActionError(message(e));
      return false;
    } finally {
      setBusy(false);
      setConfirm(null);
      reload();
    }
  }

  async function startCreate() {
    setActionError(null);
    setEditor({ id: null, mediaId: "", keyword: "SELECT", replyText: "" });
    try {
      const res = await adminFetchJson<{ media: MediaRow[] }>("/api/admin/instagram/reels");
      setMedia(res.media.filter((m) => m.productType === "REELS"));
    } catch (e) {
      setActionError(message(e));
    }
  }

  async function saveEditor() {
    if (!editor) return;
    const ok = editor.id
      ? await act({ action: "update_automation", id: editor.id, keyword: editor.keyword, replyText: editor.replyText }, "Cambios guardados. Si estaba activa, ahora está en pausa.")
      : await act({ action: "create_automation", mediaId: editor.mediaId, keyword: editor.keyword, replyText: editor.replyText }, "Automatización creada en pausa.");
    if (ok) setEditor(null);
  }

  if (!data) return error ? <AdminError message={`No se pudo cargar: ${error}`} /> : <AdminLoading />;
  const { setup, account, automations, health } = data;
  const selected = automations.find((a) => a.id === selectedId) ?? null;
  const usedMedia = new Set(automations.map((a) => a.mediaId));

  return (
    <div className="max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-ink-soft">Instagram</p>
          <h1 className="mt-1 font-serif text-[30px] font-light text-ink">Respuestas automáticas</h1>
          <p className="mt-1 text-[14px] text-ink-soft">
            {account.connected ? `@${account.username}` : "Sin cuenta conectada"} · {account.sentToday} de {account.dailyLimit} mensajes hoy · {account.sentTotal} en total
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-ink-soft" aria-live="polite">{loading ? "Actualizando…" : `Actualizado ${new Date(data.serverTime).toLocaleTimeString("es-ES", { timeStyle: "short" })}`}</span>
          <button className={ghost} disabled={loading} onClick={reload}>Actualizar</button>
        </div>
      </header>

      {error && <AdminError message={`La última actualización falló: ${error}`} />}
      {result && <p className="text-[13px] text-ink">Resultado de la conexión: <code>{result}</code></p>}
      {notice && <p className="rounded-xl bg-rose-tint px-4 py-3 text-[13px] text-ink">{notice}</p>}
      {actionError && <AdminError message={actionError} />}

      {!account.connected && (
        <section className={card}>
          <p className="text-[14px] text-ink">Conecta @{setup.allowedUsername ?? "la cuenta"} para crear automatizaciones.</p>
          <a className={`${btn} mt-3 inline-block`} href="/api/admin/instagram/connect">Conectar Instagram</a>
        </section>
      )}

      {selected ? (
        <AutomationDetail
          automation={selected}
          comments={data.comments ?? []}
          busy={busy}
          confirm={confirm}
          setConfirm={setConfirm}
          onBack={() => open(null)}
          onSend={(commentId) => act({ action: "send_one", commentId }, "Mensaje enviado.")}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-medium text-ink">Automatizaciones</h2>
            <button className={btn} disabled={!account.connected || busy || !!editor} onClick={startCreate}>Nueva automatización</button>
          </div>

          {editor && (
            <section className={card}>
              <h3 className="text-[15px] font-medium text-ink">{editor.id ? "Editar automatización" : "Nueva automatización"}</h3>
              {!editor.id && (
                <label className="mt-4 block text-[13px] text-ink">
                  Reel
                  <select className={`${input} mt-1`} value={editor.mediaId} onChange={(e) => setEditor({ ...editor, mediaId: e.target.value })}>
                    <option value="">{media ? "Elige un Reel" : "Cargando Reels…"}</option>
                    {(media ?? []).map((m) => (
                      <option key={m.id} value={m.id} disabled={usedMedia.has(m.id)}>
                        {m.timestamp?.slice(0, 10)} · {(m.caption ?? "Sin texto").split("\n")[0].slice(0, 70)}{usedMedia.has(m.id) ? " (ya tiene automatización)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="mt-4 block text-[13px] text-ink">
                Palabra clave
                <input className={`${input} mt-1 max-w-xs`} value={editor.keyword} maxLength={40} onChange={(e) => setEditor({ ...editor, keyword: e.target.value })} />
                <span className="mt-1 block text-[12px] text-ink-soft">Sin distinguir mayúsculas ni acentos.</span>
              </label>
              <label className="mt-4 block text-[13px] text-ink">
                Mensaje privado (con un enlace https://)
                <textarea className={`${input} mt-1 min-h-[96px]`} value={editor.replyText} maxLength={900} onChange={(e) => setEditor({ ...editor, replyText: e.target.value })} />
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className={btn} disabled={busy || (!editor.id && !editor.mediaId) || !editor.keyword.trim() || !editor.replyText.trim()} onClick={saveEditor}>
                  {editor.id ? "Guardar cambios" : "Crear en pausa"}
                </button>
                <button className={ghost} onClick={() => setEditor(null)}>Cancelar</button>
              </div>
            </section>
          )}

          {automations.length === 0 && !editor ? (
            <p className="text-[14px] text-ink-soft">Todavía no hay automatizaciones.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {automations.map((a) => (
                <AutomationCard
                  key={a.id}
                  a={a}
                  health={health?.reels[a.id]}
                  busy={busy}
                  confirm={confirm}
                  setConfirm={setConfirm}
                  onEdit={() => setEditor({ id: a.id, mediaId: a.mediaId, keyword: a.keyword ?? "", replyText: a.replyText ?? "" })}
                  onOpen={() => open(a.id)}
                  onStatus={(status) =>
                    act(
                      { action: "set_status", id: a.id, status, keyword: a.keyword, replyText: a.replyText },
                      status === "active" ? "Automatización activada." : status === "paused" ? "Automatización en pausa." : "Automatización desactivada.",
                    )
                  }
                  onDelete={() => act({ action: "delete_automation", id: a.id }, "Automatización eliminada. Su historial de comentarios se conserva.")}
                />
              ))}
            </div>
          )}
        </>
      )}

      <details className={card}>
        <summary className="cursor-pointer text-[14px] font-medium text-ink">Ajustes avanzados</summary>
        <div className="mt-4 space-y-5 text-[13px] text-ink">
          <div>
            <h4 className="font-medium">Cuenta</h4>
            <ul className="mt-1 space-y-1 text-ink-soft">
              <li>Conexión: {health?.account.ok ? `correcta (${health.account.accountType ?? "?"})` : (health?.account.error ?? "—")}</li>
              <li>Avisos de comentarios (webhook): {health?.subscription.ok ? "suscritos" : (health?.subscription.error ?? "no suscritos")}</li>
              <li>Permisos: {account.permissions.join(", ") || "—"}</li>
              <li>El acceso caduca: {fmt(account.tokenExpiresAt)}</li>
            </ul>
            <div className="mt-2 flex flex-wrap gap-3">
              <a className={link} href="/api/admin/instagram/connect">{account.connected ? "Volver a conectar" : "Conectar"}</a>
              {account.connected && <button className={link} disabled={busy} onClick={() => act({ action: "disconnect" }, "Cuenta desconectada. Las automatizaciones activas se han pausado.")}>Desconectar</button>}
            </div>
          </div>
          <DailyLimit value={account.dailyLimit} busy={busy} onSave={(n) => act({ action: "set_daily_limit", dailyLimit: n }, "Límite diario guardado.")} />
          <div>
            <h4 className="font-medium">Configuración de Meta</h4>
            {setup.error && <p className="mt-1 text-[#8a3b3b]">Falta configuración del servidor: {setup.error}</p>}
            <dl className="mt-1 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-ink-soft">
              <dt>URL de redirección OAuth</dt><dd className="break-all font-mono">{setup.redirectUri}</dd>
              <dt>URL del webhook</dt><dd className="break-all font-mono">{setup.webhookUrl}</dd>
              <dt>Token de verificación</dt><dd className="break-all font-mono">{setup.verifyToken ?? "—"}</dd>
              <dt>Instagram app ID</dt><dd className="font-mono">{setup.appId ?? "—"}</dd>
            </dl>
          </div>
          <div>
            <h4 className="font-medium">Últimos avisos de Meta</h4>
            {data.deliveries.length === 0 ? (
              <p className="mt-1 text-ink-soft">Ninguno.</p>
            ) : (
              <ul className="mt-1 space-y-0.5 text-[12px] text-ink-soft">
                {data.deliveries.map((d, i) => (
                  <li key={i}>{fmt(d.at)} · firma {d.signatureValid ? "válida" : d.hasSignature ? "NO válida" : "ausente"} · {d.fields.join(", ") || "—"} · {d.comments} comentario(s)</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

function AutomationCard({
  a,
  health,
  busy,
  confirm,
  setConfirm,
  onEdit,
  onOpen,
  onStatus,
  onDelete,
}: {
  a: AutomationRow;
  health?: { ok: boolean; commentsCount?: number | null; visible?: number; error?: string };
  busy: boolean;
  confirm: string | null;
  setConfirm: (v: string | null) => void;
  onEdit: () => void;
  onOpen: () => void;
  onStatus: (s: Status) => void;
  onDelete: () => void;
}) {
  const pending = (a.stats.dry_run ?? 0) + (a.stats.before_activation ?? 0);
  const canActivate = !!a.keyword && !!a.replyText;
  return (
    <article className={`${card} flex flex-col`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[14px] font-medium text-ink">{reelTitle(a)}</p>
          {a.mediaPermalink && <a className="text-[12px] text-ink-soft underline" href={a.mediaPermalink} target="_blank" rel="noreferrer">Ver Reel</a>}
        </div>
        <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
      </div>
      <p className="mt-3 text-[13px] text-ink">
        Palabra clave: <span className="rounded-md bg-rose-tint px-2 py-0.5 font-medium">{a.keyword || "sin definir"}</span>
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-paper px-2 py-2"><dt className="text-[11px] text-ink-soft">Enviados</dt><dd className="text-[18px] font-light text-ink">{a.stats.sent ?? 0}</dd></div>
        <div className="rounded-xl bg-paper px-2 py-2"><dt className="text-[11px] text-ink-soft">Errores</dt><dd className={`text-[18px] font-light ${(a.stats.send_failed ?? 0) > 0 ? "text-[#8a3b3b]" : "text-ink"}`}>{a.stats.send_failed ?? 0}</dd></div>
        <div className="rounded-xl bg-paper px-2 py-2"><dt className="text-[11px] text-ink-soft">Nuevos sin enviar</dt><dd className="text-[18px] font-light text-ink">{pending}</dd></div>
      </dl>
      {health && !health.ok && <p className="mt-2 text-[12px] text-[#8a3b3b]">Instagram: {health.error}</p>}
      {a.status === "active" && a.activeSince && <p className="mt-2 text-[12px] text-ink-soft">Activa desde {fmt(a.activeSince)}. Solo responde a comentarios nuevos.</p>}

      {confirm === `activate:${a.id}` && (
        <div className="mt-4 rounded-xl bg-rose-tint px-4 py-3 text-[13px] text-ink">
          <p>Se enviará este mensaje a cada <strong>nuevo</strong> comentario con «{a.keyword}». Los comentarios anteriores nunca lo reciben. Comprueba que ManyChat no responde en este Reel.</p>
          <p className="mt-2 rounded-lg bg-white px-3 py-2"><Linkified text={a.replyText ?? ""} /></p>
          <div className="mt-3 flex gap-2">
            <button className={btn} disabled={busy} onClick={() => onStatus("active")}>Sí, activar</button>
            <button className={ghost} onClick={() => setConfirm(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {confirm === `delete:${a.id}` && (
        <div className="mt-4 rounded-xl bg-rose-tint px-4 py-3 text-[13px] text-ink">
          <p>¿Eliminar esta automatización? Su historial de comentarios y mensajes se conserva.</p>
          <div className="mt-3 flex gap-2">
            <button className={btn} disabled={busy} onClick={onDelete}>Sí, eliminar</button>
            <button className={ghost} onClick={() => setConfirm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
        {a.status === "active" ? (
          <button className={btn} disabled={busy} onClick={() => onStatus("paused")}>Pausar</button>
        ) : (
          <button className={btn} disabled={busy || !canActivate} onClick={() => setConfirm(`activate:${a.id}`)}>Activar</button>
        )}
        <button className={link} disabled={busy} onClick={onEdit}>Editar</button>
        <button className={link} onClick={onOpen}>Comentarios</button>
        {a.status !== "off" && a.status !== "active" && <button className={link} disabled={busy} onClick={() => onStatus("off")}>Desactivar</button>}
        {a.status === "off" && <button className={link} disabled={busy} onClick={() => onStatus("paused")}>Detectar en pausa</button>}
        {a.status !== "active" && <button className={`${link} text-[#8a3b3b]`} disabled={busy} onClick={() => setConfirm(`delete:${a.id}`)}>Eliminar</button>}
      </div>
    </article>
  );
}

function AutomationDetail({
  automation: a,
  comments,
  busy,
  confirm,
  setConfirm,
  onBack,
  onSend,
}: {
  automation: AutomationRow;
  comments: CommentRow[];
  busy: boolean;
  confirm: string | null;
  setConfirm: (v: string | null) => void;
  onBack: () => void;
  onSend: (commentId: string) => void;
}) {
  const [filter, setFilter] = useState<FilterKey>("keyword");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const counts = useMemo(
    () => ({
      keyword: comments.filter((c) => c.keywordMatched).length,
      new: comments.filter((c) => !c.historical).length,
      historical: comments.filter((c) => c.historical).length,
      sent: comments.filter((c) => c.decision === "sent").length,
      errors: comments.filter((c) => c.decision === "send_failed").length,
      all: comments.length,
    }),
    [comments],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return comments.filter((c) => {
      const passes =
        filter === "all" ||
        (filter === "keyword" && c.keywordMatched) ||
        (filter === "new" && !c.historical) ||
        (filter === "historical" && c.historical) ||
        (filter === "sent" && c.decision === "sent") ||
        (filter === "errors" && c.decision === "send_failed");
      return passes && (!q || (c.text ?? "").toLowerCase().includes(q) || (c.fromUsername ?? "").toLowerCase().includes(q));
    });
  }, [comments, filter, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <section className="space-y-4">
      <button className={link} onClick={onBack}>← Todas las automatizaciones</button>
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-ink">{reelTitle(a)}</p>
            <p className="mt-1 text-[13px] text-ink-soft">
              Palabra clave «{a.keyword ?? "—"}» · creada {fmt(a.createdAt)}
              {a.mediaPermalink && <> · <a className="underline" href={a.mediaPermalink} target="_blank" rel="noreferrer">Ver Reel</a></>}
            </p>
          </div>
          <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
        </div>
        {a.replyText && <p className="mt-3 rounded-xl bg-paper px-4 py-3 text-[13px] text-ink"><Linkified text={a.replyText} /></p>}
        <p className="mt-3 text-[12px] text-ink-soft">
          «Histórico» = escrito antes de crear la automatización: nunca recibe el mensaje automáticamente. Solo los comentarios nuevos escritos con la automatización activa lo reciben.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${filter === f.key ? "bg-ink text-paper" : "border border-hairline text-ink hover:border-rose"}`}
            onClick={() => {
              setFilter(f.key);
              setPage(0);
            }}
          >
            {f.label} · {counts[f.key]}
          </button>
        ))}
        <input
          className="ml-auto w-full rounded-full border border-hairline bg-white px-4 py-1.5 text-[13px] sm:w-56"
          placeholder="Buscar texto o usuario"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </div>

      {shown.length === 0 ? (
        <p className="text-[13px] text-ink-soft">No hay comentarios con este filtro.</p>
      ) : (
        <ul className="divide-y divide-hairline rounded-2xl border border-hairline bg-white">
          {shown.map((c) => {
            const d = DECISIONS[c.decision ?? ""] ?? { label: c.decision ?? "—", tone: "neutral" as const };
            const canSend = c.keywordMatched && MANUALLY_SENDABLE.has(c.decision ?? "") && !!a.replyText;
            return (
              <li key={c.commentId} className="px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-ink">
                    <span className="font-medium">@{c.fromUsername ?? "?"}</span> {c.text ?? ""}
                  </p>
                  <Badge tone={d.tone}>{d.label}</Badge>
                </div>
                <p className="mt-1 text-[12px] text-ink-soft">
                  {fmt(c.writtenAt ?? c.receivedAt)}
                  {c.parentId ? " · respuesta a otro comentario" : ""}
                  {c.sentAt ? ` · enviado ${fmt(c.sentAt)}` : ""}
                </p>
                {c.error?.message && <p className="mt-1 text-[12px] text-[#8a3b3b]">Meta: {c.error.message}</p>}
                {canSend && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {confirm === `send:${c.commentId}` ? (
                      <>
                        <span className="text-[12px] text-ink">¿Enviar el mensaje solo a @{c.fromUsername}?</span>
                        <button className={btn} disabled={busy} onClick={() => onSend(c.commentId)}>Sí, enviar</button>
                        <button className={ghost} onClick={() => setConfirm(null)}>Cancelar</button>
                      </>
                    ) : (
                      <button className={link} disabled={busy} onClick={() => setConfirm(`send:${c.commentId}`)}>
                        {c.decision === "send_failed" ? "Reintentar el envío" : "Enviar a esta persona"}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-[13px] text-ink-soft">
          <button className={ghost} disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</button>
          <span>Página {current + 1} de {pages} · {filtered.length} comentarios</span>
          <button className={ghost} disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Siguiente</button>
        </div>
      )}
    </section>
  );
}

function DailyLimit({ value, busy, onSave }: { value: number; busy: boolean; onSave: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const v = draft ?? String(value);
  return (
    <div>
      <h4 className="font-medium">Límite diario de mensajes (todas las automatizaciones)</h4>
      <div className="mt-1 flex items-center gap-2">
        <input className={`${input} w-24`} inputMode="numeric" value={v} onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))} />
        <button className={ghost} disabled={busy || draft === null || v === String(value) || !v} onClick={() => { onSave(Number(v)); setDraft(null); }}>Guardar</button>
      </div>
    </div>
  );
}
