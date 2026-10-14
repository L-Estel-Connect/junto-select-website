// Local stand-in for Stripe and Brevo, for testing the site on a laptop
// with the Firebase emulators. Nothing here talks to the real services.
//
//   Stripe: POST /v1/customers, POST /v1/checkout/sessions,
//           GET and DELETE (cancel) /v1/subscriptions/:id (ids starting
//           sub_fail answer 500; unknown ids answer resource_missing), plus a fake hosted checkout page at
//           /pay/:sessionId whose "Pagar" button sends a signed
//           checkout.session.completed webhook to the app, like Stripe does.
//   Brevo:  POST /v3/contacts and /v3/smtp/email (recorded, never sent).
//   Ticket Tailor: POST/GET /v1/discounts, DELETE /v1/discounts/:id
//           (kept in memory, used with TICKET_TAILOR_LOCAL_MOCK_URL), and
//           GET /v1/event_series/:id/events and GET /v1/events/:id for
//           the Events Manager import (read-only;
//           see MOCK_TT_EVENTS below for what is real and what is made up).
//   Test controls (not Stripe): POST /test/subscriptions/:id/renew moves
//           current_period_end forward one plan period, /backdate?days=N
//           moves the whole subscription N days into the past (time
//           passing), /cancel ends it; each sends the matching webhook.
//   Set MOCK_TT_FAIL=1 to make Ticket Tailor discount creation fail.
//
// Every request is appended to MOCK_LOG (default ./.local-test/mock-log.jsonl)
// so tests can check what the app would have sent.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";

const PORT = Number(process.env.MOCK_PORT || 12111);
const APP = process.env.APP_BASE_URL || "http://localhost:3000";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_local_test";
const LOG = process.env.MOCK_LOG || path.resolve(".local-test/mock-log.jsonl");
fs.mkdirSync(path.dirname(LOG), { recursive: true });

const stripe = new Stripe("sk_test_local_mock");
const customers = new Map();
const sessions = new Map();
const subscriptions = new Map();
const discounts = new Map();
const planMonths = new Map();
const PLAN_MONTHS = { monthly: 1, three_month: 3, six_month: 6 };
let seq = 0;
const id = (prefix) => `${prefix}_test_${Date.now().toString(36)}${(seq++).toString(36)}`;

// Ticket Tailor event fixtures. The shape matches a real response checked
// on 2026-10-12: the public link's number (2439069) is the event SERIES
// id, and the dated event inside it is ev_9175061. Title, date, times and
// image copy the real event; the ticket types and the venue name are MOCK
// values.
const MOCK_TT_SERIES = { es_2439069: ["ev_9175061"] };
const MOCK_TT_EVENTS = {
  ev_9175061: {
    object: "event",
    id: "ev_9175061",
    event_series_id: "es_2439069",
    name: "Junto Select OCTOBER 2026",
    description: "<p>Una noche para conocer gente nueva en el corazón de Madrid. (Texto de prueba local.)</p>",
    start: { date: "2026-10-29", time: "20:00", iso: "2026-10-29T20:00:00+01:00", timezone: "+01:00", unix: 1793300400 },
    end: { date: "2026-10-29", time: "23:00", iso: "2026-10-29T23:00:00+01:00", timezone: "+01:00", unix: 1793311200 },
    images: { header: "https://uploads.tickettailorassets.com/c_scale,w_800/v1/production/userfiles/xiseq0x2lz0kmcaekpq2.jpg?_a=BAAHWXDQ" },
    url: "https://www.tickettailor.com/events/juntoselect/2439069",
    tickets_available: "true",
    venue: { name: "MOCK venue (not the real one)" },
    ticket_types: [
      { object: "ticket_type", id: "tt_mock1", name: "MOCK Entrada general" },
      { object: "ticket_type", id: "tt_mock2", name: "MOCK Entrada pareja" },
    ],
  },
};

function log(entry) {
  fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

// Stripe sends application/x-www-form-urlencoded with bracketed keys.
function parseForm(body) {
  const out = {};
  for (const [key, value] of new URLSearchParams(body)) {
    const parts = key.replace(/\]/g, "").split("[");
    let node = out;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) node[part] = value;
      else node = node[part] ??= /^\d+$/.test(parts[i + 1]) ? [] : {};
    });
  }
  return out;
}

function json(res, status, data) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

async function sendWebhook(event) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const res = await fetch(`${APP}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
  log({ service: "stripe", kind: "webhook_sent", type: event.type, status: res.status });
  return res.status;
}

function checkoutPage(session) {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pago de prueba</title>
<body style="font-family:system-ui;max-width:420px;margin:60px auto;padding:0 16px;color:#1e1a18">
<p style="background:#fff3cd;padding:10px 12px;border-radius:6px">Pago SIMULADO en local. No es Stripe y no se cobra nada.</p>
<h1 style="font-weight:500">Junto Select</h1>
<p>Plan: <strong>${session.metadata?.planKey}</strong><br>Precio: ${session.line_items?.[0]?.price}</p>
<form method="post" action="/pay/${session.id}"><button id="pay" style="padding:12px 20px;font-size:16px">Pagar (simulado)</button></form>
<p><a id="cancel" href="${session.cancel_url}">Volver sin pagar</a></p></body></html>`;
}

const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = url.pathname;

  try {
    // ---- Brevo ----
    if (p === "/v3/contacts" && req.method === "POST") {
      const data = JSON.parse(body || "{}");
      log({ service: "brevo", kind: "contact_upsert", apiKeyPresent: Boolean(req.headers["api-key"]), data });
      return json(res, 201, { id: ++seq });
    }

    if (p === "/v3/smtp/email" && req.method === "POST") {
      const data = JSON.parse(body || "{}");
      log({ service: "brevo", kind: "transactional_email", to: data.to, subject: data.subject });
      return json(res, 201, { messageId: `<local-${++seq}@mock>` });
    }

    // ---- Ticket Tailor ----
    if (p === "/v1/discounts" && req.method === "POST") {
      const form = new URLSearchParams(body);
      if (process.env.MOCK_TT_FAIL === "1" || fs.existsSync(path.resolve(".local-test/tt-fail"))) {
        log({ service: "tickettailor", kind: "discount_create_failed", code: form.get("code") });
        return json(res, 503, { error: "mock failure" });
      }
      const discount = {
        id: id("dc"),
        code: form.get("code"),
        face_value_percentage: Number(form.get("price_percent")),
        ticket_types: form.getAll("ticket_types[]"),
        max_redemptions: Number(form.get("max_redemptions")),
        expires: form.get("expires"),
      };
      discounts.set(discount.id, discount);
      log({ service: "tickettailor", kind: "discount_create", data: discount });
      return json(res, 200, discount);
    }
    if (p === "/v1/discounts" && req.method === "GET") {
      const code = url.searchParams.get("code");
      return json(res, 200, { data: [...discounts.values()].filter((d) => !code || d.code === code) });
    }
    const discMatch = p.match(/^\/v1\/discounts\/([^/]+)$/);
    if (discMatch && req.method === "DELETE") {
      discounts.delete(discMatch[1]);
      log({ service: "tickettailor", kind: "discount_delete", id: discMatch[1] });
      return json(res, 200, { deleted: true });
    }

    const seriesMatch = p.match(/^\/v1\/event_series\/([^/]+)\/events$/);
    if (seriesMatch && req.method === "GET") {
      log({ service: "tickettailor", kind: "series_events_get", id: seriesMatch[1] });
      const ids = MOCK_TT_SERIES[seriesMatch[1]];
      // As in the real API, the listing leaves out name, description, images and venue.
      const slim = (ev) => Object.fromEntries(Object.entries(ev).filter(([k]) => !["name", "description", "images", "venue"].includes(k)));
      return ids ? json(res, 200, { data: ids.map((i) => slim(MOCK_TT_EVENTS[i])) }) : json(res, 404, { status: 404, error_code: "PAGE_NOT_FOUND", message: "Page not found" });
    }

    const evMatch = p.match(/^\/v1\/events\/([^/]+)$/);
    if (evMatch && req.method === "GET") {
      log({ service: "tickettailor", kind: "event_get", id: evMatch[1] });
      const ev = MOCK_TT_EVENTS[evMatch[1]];
      return ev ? json(res, 200, ev) : json(res, 404, { error: "not found" });
    }

    // ---- Test controls ----
    if (p === "/test/subscriptions" && req.method === "POST") {
      // Creates an active subscription directly (no checkout, no webhook),
      // for tests that seed billing/{uid} themselves.
      const form = JSON.parse(body || "{}");
      const now = Math.floor(Date.now() / 1000);
      const sub = {
        id: form.id || id("sub"),
        object: "subscription",
        customer: form.customer || id("cus"),
        status: "active",
        start_date: now,
        canceled_at: null,
        cancel_at_period_end: false,
        metadata: form.metadata ?? {},
        items: { data: [{ current_period_start: now, current_period_end: now + 30 * 86400, price: { id: "price_test_monthly" } }] },
      };
      subscriptions.set(sub.id, sub);
      return json(res, 200, sub);
    }
    const ctl = p.match(/^\/test\/subscriptions\/([^/]+)\/(renew|cancel|backdate)$/);
    if (ctl && req.method === "POST") {
      const sub = subscriptions.get(ctl[1]);
      if (!sub) return json(res, 404, { error: "unknown subscription" });
      const item = sub.items.data[0];
      if (ctl[2] === "backdate") {
        // Simulates time passing: the whole subscription moves N days into the past.
        const shift = Number(url.searchParams.get("days") || 0) * 86400;
        sub.start_date -= shift;
        item.current_period_start -= shift;
        item.current_period_end -= shift;
      } else if (ctl[2] === "renew") {
        const months = planMonths.get(sub.id) ?? 1;
        item.current_period_start = item.current_period_end;
        item.current_period_end += months * 30 * 86400;
      } else {
        sub.status = "canceled";
        sub.canceled_at = Math.floor(Date.now() / 1000);
      }
      const status = await sendWebhook({
        id: id("evt"),
        object: "event",
        type: ctl[2] === "renew" ? "customer.subscription.updated" : "customer.subscription.deleted",
        data: { object: sub },
      });
      return json(res, 200, { webhookStatus: status, subscription: sub });
    }

    // ---- Stripe API ----
    if (p === "/v1/customers" && req.method === "POST") {
      const form = parseForm(body);
      const customer = { id: id("cus"), object: "customer", email: form.email ?? null, metadata: form.metadata ?? {} };
      customers.set(customer.id, customer);
      log({ service: "stripe", kind: "customer_create", data: customer });
      return json(res, 200, customer);
    }
    if (p === "/v1/checkout/sessions" && req.method === "POST") {
      const form = parseForm(body);
      const session = {
        id: id("cs"),
        object: "checkout.session",
        mode: form.mode,
        customer: form.customer,
        client_reference_id: form.client_reference_id,
        success_url: form.success_url,
        cancel_url: form.cancel_url,
        line_items: form.line_items,
        metadata: form.metadata ?? {},
        subscription_data: form.subscription_data ?? {},
        subscription: null,
        url: `http://127.0.0.1:${PORT}/pay/`,
      };
      session.url += session.id;
      sessions.set(session.id, session);
      log({ service: "stripe", kind: "checkout_session_create", data: session });
      return json(res, 200, session);
    }
    const subMatch = p.match(/^\/v1\/subscriptions\/([^/]+)$/);
    if (subMatch && subMatch[1].startsWith("sub_fail")) {
      // Simulates Stripe being unreachable or erroring for this subscription.
      log({ service: "stripe", kind: "subscription_error", id: subMatch[1], method: req.method });
      return json(res, 500, { error: { type: "api_error", message: "mock: Stripe unavailable" } });
    }
    if (subMatch && (req.method === "GET" || req.method === "DELETE")) {
      const sub = subscriptions.get(subMatch[1]);
      if (!sub) {
        // Same answer real Stripe gives for an id it doesn't know under this
        // key, e.g. a test-mode subscription looked up with the live key.
        return json(res, 404, {
          error: { type: "invalid_request_error", code: "resource_missing", message: `No such subscription: '${subMatch[1]}'` },
        });
      }
      if (req.method === "DELETE") {
        sub.status = "canceled";
        sub.canceled_at = Math.floor(Date.now() / 1000);
        log({ service: "stripe", kind: "subscription_cancel", id: sub.id });
        await sendWebhook({ id: id("evt"), object: "event", type: "customer.subscription.deleted", data: { object: sub } });
      }
      return json(res, 200, sub);
    }

    // ---- Fake hosted checkout ----
    const payMatch = p.match(/^\/pay\/([^/]+)$/);
    if (payMatch) {
      const session = sessions.get(payMatch[1]);
      if (!session) return json(res, 404, { error: "unknown session" });
      if (req.method === "GET") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(checkoutPage(session));
      }
      const now = Math.floor(Date.now() / 1000);
      const months = PLAN_MONTHS[session.metadata.planKey] ?? 1;
      const sub = {
        id: id("sub"),
        object: "subscription",
        customer: session.customer,
        status: "active",
        start_date: now,
        cancel_at_period_end: false,
        cancel_at: null,
        canceled_at: null,
        metadata: session.subscription_data.metadata ?? {},
        items: {
          object: "list",
          data: [{ id: id("si"), price: { id: session.line_items[0].price }, current_period_start: now, current_period_end: now + months * 30 * 86400 }],
        },
      };
      subscriptions.set(sub.id, sub);
      planMonths.set(sub.id, months);
      session.subscription = sub.id;
      session.status = "complete";
      session.payment_status = "paid";
      const status = await sendWebhook({
        id: id("evt"),
        object: "event",
        type: "checkout.session.completed",
        data: { object: session },
      });
      if (status !== 200) return json(res, 502, { error: `webhook returned ${status}` });
      res.writeHead(303, { location: session.success_url });
      return res.end();
    }

    json(res, 404, { error: `mock: unhandled ${req.method} ${p}` });
  } catch (error) {
    log({ service: "mock", kind: "error", message: String(error) });
    json(res, 500, { error: String(error) });
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock services on http://127.0.0.1:${PORT}`));
