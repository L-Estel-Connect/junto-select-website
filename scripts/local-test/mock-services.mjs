// Local stand-in for Stripe and Brevo, for testing the site on a laptop
// with the Firebase emulators. Nothing here talks to the real services.
//
//   Stripe: POST /v1/customers, POST /v1/checkout/sessions,
//           GET /v1/subscriptions/:id, plus a fake hosted checkout page at
//           /pay/:sessionId whose "Pagar" button sends a signed
//           checkout.session.completed webhook to the app, like Stripe does.
//   Brevo:  POST /v3/contacts and /v3/smtp/email (recorded, never sent).
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
let seq = 0;
const id = (prefix) => `${prefix}_test_${Date.now().toString(36)}${(seq++).toString(36)}`;

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
    if (subMatch && req.method === "GET") {
      const sub = subscriptions.get(subMatch[1]);
      if (!sub) return json(res, 404, { error: { type: "invalid_request_error", message: "No such subscription" } });
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
      const months = { monthly: 1, three_month: 3, six_month: 6 }[session.metadata.planKey] ?? 1;
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
