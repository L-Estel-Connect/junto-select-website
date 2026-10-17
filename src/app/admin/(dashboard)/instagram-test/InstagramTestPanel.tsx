"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Badge from "@/components/admin/Badge";
import { AdminError, AdminLoading } from "@/components/admin/States";
import { adminFetchJson } from "@/lib/admin/adminFetch";

interface TestEvent {
  commentId: string;
  receivedAt: string | null;
  mediaId: string | null;
  mediaProductType: string | null;
  fromUsername: string | null;
  text: string | null;
  parentId: string | null;
  keywordMatched: boolean;
  decision: string | null;
  deliveries: number;
  messageId: string | null;
  error: { message?: string; code?: number | null; subcode?: number | null } | null;
}

interface ApiCommentCheck {
  commentId: string;
  username: string | null;
  text: string | null;
  timestamp: string | null;
  isReply: boolean;
  keywordMatched: boolean;
  decision: string;
  receivedByWebhook: boolean;
}

interface Diagnosis {
  checkedAt: string;
  account: { ok: boolean; username?: string; igUserId?: string; accountType?: string | null; error?: string };
  subscription: { ok: boolean; fields: string[]; error?: string };
  reel: { ok: boolean; mediaId?: string | null; permalink?: string | null; productType?: string | null; commentsCount?: number | null; error?: string };
  comments: { ok: boolean; items: ApiCommentCheck[]; error?: string };
  error?: string;
}

interface StateResponse {
  diagnosis: Diagnosis | null;
  serverTime: string;
  setup: { appId: string | null; redirectUri: string; webhookUrl: string; verifyToken: string | null; error: string | null; graphVersion: string; allowedUsername: string };
  test: { keywords: string[]; replyText: string; maxReplies: number };
  state: {
    connected: boolean;
    username: string | null;
    igUserId: string | null;
    permissions: string[];
    tokenExpiresAt: string | null;
    subscribed: boolean;
    subscribeError: string | null;
    mediaId: string | null;
    mediaPermalink: string | null;
    mediaCaption: string | null;
    testCommenterUsername: string | null;
    sendEnabled: boolean;
    sentCount: number;
  };
  events: TestEvent[];
  deliveries: { at: string | null; signatureValid: boolean; signedWith: string | null; hasSignature: boolean; object: string | null; fields: string[]; comments: number }[];
}

interface MediaRow {
  id: string;
  caption: string | null;
  productType: string | null;
  permalink: string | null;
  timestamp: string | null;
}

const DECISIONS: Record<string, { label: string; tone: "positive" | "warning" | "negative" | "muted" | "neutral" }> = {
  sent: { label: "Respuesta enviada", tone: "positive" },
  send_failed: { label: "Envío fallido", tone: "negative" },
  dry_run: { label: "Habría respondido (envío desactivado)", tone: "warning" },
  repeat_person: { label: "Repetido: ya respondido a esta persona", tone: "muted" },
  cap_reached: { label: "Límite de prueba alcanzado", tone: "muted" },
  no_keyword: { label: "Sin palabra clave", tone: "muted" },
  other_reel: { label: "Otro Reel: ignorado", tone: "muted" },
  not_test_commenter: { label: "No es la cuenta de prueba: ignorado", tone: "muted" },
  own_comment: { label: "Comentario propio: ignorado", tone: "muted" },
  other_account: { label: "Otra cuenta: ignorado", tone: "muted" },
  too_old: { label: "Más de 7 días: ignorado", tone: "muted" },
  not_connected: { label: "Sin conexión", tone: "negative" },
  pending: { label: "En curso", tone: "neutral" },
};

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "medium" }) : "—";
}

export default function InstagramTestPanel() {
  const result = useSearchParams().get("result");
  const [data, setData] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  // "Actualizar" re-reads everything and re-checks the Instagram API. It shows
  // that it's working, when it last succeeded, and any error, while keeping
  // the last good data on screen.
  const fetchState = useCallback(() => {
    adminFetchJson<StateResponse>("/api/admin/instagram-test/state")
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
  const [media, setMedia] = useState<MediaRow[] | null>(null);
  const [commenter, setCommenter] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await adminFetchJson("/api/admin/instagram-test/state", { method: "POST", body: JSON.stringify(body) });
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmSend(false);
    }
  }

  async function loadMedia() {
    setActionError(null);
    try {
      const res = await adminFetchJson<{ media: MediaRow[] }>("/api/admin/instagram-test/reels");
      setMedia(res.media);
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  if (!data) return error ? <AdminError message={`No se pudo cargar: ${error}`} /> : <AdminLoading />;
  const { setup, state, test, events, deliveries, diagnosis } = data;
  const card = "rounded-2xl border border-hairline bg-white p-6";
  const btn = "rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper disabled:opacity-40";
  const ghost = "rounded-full border border-hairline px-4 py-2 text-[13px] font-medium text-ink hover:border-rose disabled:opacity-40";

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-ink-soft">Staging · prueba técnica</p>
        <h1 className="mt-1 font-serif text-[30px] font-light text-ink">Prueba de acceso a Instagram</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          Página temporal para comprobar que Meta nos envía los comentarios y que podemos responder en privado. No es la herramienta final.
          Solo se puede conectar @{setup.allowedUsername}, solo se responde en un Reel y a una cuenta de prueba, y como máximo {test.maxReplies} veces.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper disabled:opacity-40" disabled={loading} onClick={reload}>
            {loading ? "Actualizando…" : "Actualizar"}
          </button>
          <span className="text-[12px] text-ink-soft" aria-live="polite">
            {loading ? "Leyendo datos y comprobando la API de Instagram…" : loadedAt ? `Actualizado a las ${new Date(loadedAt).toLocaleTimeString("es-ES")}` : ""}
          </span>
        </div>
        {error && <div className="mt-3"><AdminError message={`La última actualización falló: ${error}`} /></div>}
        {result && <p className="mt-3 text-[13px] text-ink">Resultado de la conexión: <code>{result}</code></p>}
        {actionError && <div className="mt-3"><AdminError message={actionError} /></div>}
      </div>

      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">1 · Datos para Meta for Developers</h2>
        {setup.error && <p className="mt-2 text-[13px] text-[#8a3b3b]">Falta configuración: {setup.error}</p>}
        <dl className="mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-ink-soft">URL de redirección OAuth</dt><dd className="break-all font-mono">{setup.redirectUri}</dd>
          <dt className="text-ink-soft">URL de devolución (webhook)</dt><dd className="break-all font-mono">{setup.webhookUrl}</dd>
          <dt className="text-ink-soft">Token de verificación</dt><dd className="break-all font-mono">{setup.verifyToken ?? "—"}</dd>
          <dt className="text-ink-soft">Instagram app ID</dt><dd className="font-mono">{setup.appId ?? "—"}</dd>
        </dl>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-medium text-ink">2 · Cuenta de Instagram</h2>
          {state.connected ? <Badge tone="positive">Conectada: @{state.username}</Badge> : <Badge tone="muted">Sin conectar</Badge>}
        </div>
        {state.connected && (
          <p className="mt-2 text-[13px] text-ink-soft">
            Permisos: {state.permissions.join(", ") || "—"} · Caduca: {fmt(state.tokenExpiresAt)} · Comentarios suscritos:{" "}
            {state.subscribed ? "sí" : `no${state.subscribeError ? ` (${state.subscribeError})` : ""}`}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <a className={btn} href="/api/admin/instagram-test/connect">{state.connected ? "Volver a conectar" : "Conectar Instagram"}</a>
          {state.connected && <button className={ghost} disabled={busy} onClick={() => act({ action: "disconnect" })}>Desconectar</button>}
        </div>
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">3 · Reel y cuenta de prueba</h2>
        <p className="mt-2 text-[13px] text-ink">
          Reel: {state.mediaId ? <a className="underline" href={state.mediaPermalink ?? "#"} target="_blank" rel="noreferrer">{state.mediaCaption || state.mediaPermalink}</a> : "sin elegir"}
          {" · "}Cuenta que comenta: {state.testCommenterUsername ? `@${state.testCommenterUsername}` : "sin definir"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={ghost} disabled={!state.connected} onClick={loadMedia}>Ver mis publicaciones recientes</button>
        </div>
        {media && (
          <ul className="mt-3 divide-y divide-hairline rounded-xl border border-hairline">
            {media.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="text-ink-soft">{m.timestamp?.slice(0, 10)} · {m.productType}</span>
                  <br />
                  <a className="underline" href={m.permalink ?? "#"} target="_blank" rel="noreferrer">{m.caption || m.permalink}</a>
                </span>
                {m.productType === "REELS" && (
                  <button className={ghost} disabled={busy || m.id === state.mediaId} onClick={() => act({ action: "select_reel", mediaId: m.id })}>
                    {m.id === state.mediaId ? "Elegido" : "Elegir este Reel"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            className="rounded-lg border border-hairline bg-paper px-3 py-2 text-[13px]"
            placeholder="usuario de la cuenta de prueba"
            value={commenter}
            onChange={(e) => setCommenter(e.target.value)}
          />
          <button className={ghost} disabled={busy || !commenter.trim()} onClick={() => act({ action: "set_commenter", username: commenter })}>Guardar cuenta de prueba</button>
        </div>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-medium text-ink">4 · Envío de la respuesta privada</h2>
          {state.sendEnabled ? <Badge tone="positive">Envío activado</Badge> : <Badge tone="warning">Envío desactivado (solo registro)</Badge>}
        </div>
        <p className="mt-2 text-[13px] text-ink-soft">Palabra clave: {test.keywords.join(", ").toUpperCase()} · Respuestas enviadas: {state.sentCount} de {test.maxReplies}</p>
        <p className="mt-2 rounded-xl bg-rose-tint px-4 py-3 text-[13px] leading-relaxed text-ink">{test.replyText}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {!state.sendEnabled && !confirmSend && (
            <button className={btn} disabled={busy || !state.mediaId || !state.testCommenterUsername} onClick={() => setConfirmSend(true)}>Activar envío de prueba</button>
          )}
          {confirmSend && (
            <>
              <span className="text-[13px] text-ink">¿Responder solo a @{state.testCommenterUsername} en el Reel elegido?</span>
              <button className={btn} disabled={busy} onClick={() => act({ action: "enable_sending" })}>Sí, activar</button>
              <button className={ghost} onClick={() => setConfirmSend(false)}>Cancelar</button>
            </>
          )}
          {state.sendEnabled && <button className={btn} disabled={busy} onClick={() => act({ action: "disable_sending" })}>Desactivar envío</button>}
          <button className={ghost} disabled={busy} onClick={() => act({ action: "reset_test" })}>Reiniciar contador</button>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">Comprobación directa con la API de Instagram</h2>
        <p className="mt-1 text-[12px] text-ink-soft">Solo lectura, sin webhook. Se repite en cada actualización. Nunca envía nada.</p>
        {!diagnosis ? (
          <p className="mt-2 text-[13px] text-ink-soft">—</p>
        ) : diagnosis.error ? (
          <AdminError message={diagnosis.error} />
        ) : (
          <>
            <ul className="mt-3 space-y-1 text-[13px] text-ink">
              <li>Cuenta: {diagnosis.account.ok ? `@${diagnosis.account.username} (${diagnosis.account.accountType ?? "?"})` : `error: ${diagnosis.account.error}`}</li>
              <li>Suscripción de la app: {diagnosis.subscription.error ? `error: ${diagnosis.subscription.error}` : diagnosis.subscription.fields.join(", ") || "ningún campo"}</li>
              <li>Reel: {diagnosis.reel.ok ? `${diagnosis.reel.productType}, ${diagnosis.reel.commentsCount ?? "?"} comentarios según Instagram` : `error: ${diagnosis.reel.error}`}</li>
            </ul>
            {diagnosis.comments.error && <p className="mt-2 text-[13px] text-[#8a3b3b]">Comentarios: {diagnosis.comments.error}</p>}
            {diagnosis.comments.ok && (
              <ul className="mt-3 space-y-2">
                {diagnosis.comments.items.length === 0 && <li className="text-[13px] text-ink-soft">La API no muestra comentarios en este Reel.</li>}
                {diagnosis.comments.items.map((c) => {
                  const d = DECISIONS[c.decision] ?? { label: c.decision, tone: "neutral" as const };
                  return (
                    <li key={c.commentId} className="rounded-xl border border-hairline px-4 py-3 text-[13px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-ink">@{c.username ?? "?"}: «{c.text ?? ""}»</span>
                        <Badge tone={d.tone}>{d.label}</Badge>
                      </div>
                      <p className="mt-1 text-[12px] text-ink-soft">
                        {fmt(c.timestamp)} · palabra clave {c.keywordMatched ? "sí" : "no"}{c.isReply ? " · respuesta a otro comentario" : ""} · webhook de Meta: {c.receivedByWebhook ? "recibido" : "no recibido"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">5 · Comentarios recibidos por webhook</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-soft">Todavía no ha llegado ningún comentario.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {events.map((e) => {
              const d = DECISIONS[e.decision ?? "pending"] ?? { label: e.decision ?? "—", tone: "neutral" as const };
              return (
                <li key={e.commentId} className="rounded-xl border border-hairline px-4 py-3 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-ink">@{e.fromUsername ?? "?"}: «{e.text ?? ""}»</span>
                    <Badge tone={d.tone}>{d.label}</Badge>
                  </div>
                  <p className="mt-1 text-[12px] text-ink-soft">
                    {fmt(e.receivedAt)} · comentario {e.commentId} · Reel {e.mediaId ?? "?"} ({e.mediaProductType ?? "?"}) · palabra clave {e.keywordMatched ? "sí" : "no"} · entregas {e.deliveries}
                    {e.parentId ? " · respuesta a otro comentario" : ""}
                    {e.messageId ? ` · mensaje ${e.messageId}` : ""}
                  </p>
                  {e.error && <p className="mt-1 text-[12px] text-[#8a3b3b]">Error de Meta: {e.error.message} {e.error.code ? `(código ${e.error.code}${e.error.subcode ? `/${e.error.subcode}` : ""})` : ""}</p>}
                </li>
              );
            })}
          </ul>
        )}
        <h3 className="mt-6 text-[13px] font-medium text-ink">Llamadas recibidas de Meta</h3>
        {deliveries.length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-soft">Ninguna todavía.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-[12px] text-ink-soft">
            {deliveries.map((d, i) => (
              <li key={i}>{fmt(d.at)} · firma {d.signatureValid ? `válida (${d.signedWith})` : d.hasSignature ? "NO válida" : "ausente"} · {d.object ?? "?"} · campos {d.fields.join(", ") || "—"} · comentarios {d.comments}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
