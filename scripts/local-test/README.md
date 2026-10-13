# Local testing (no live services)

Runs the whole site on your machine against the Firebase emulators and a
local stand-in for Stripe and Brevo. Nothing touches production Firebase,
Stripe, Brevo or real email addresses.

```bash
cp scripts/local-test/env.local.example .env.local   # fake values only
npm ci && npx next build
firebase emulators:start --project demo-junto-select --only auth,firestore,storage   # terminal 1
scripts/local-test/start.sh                                                         # terminal 2
set -a; . ./.env.local; set +a                                                      # terminal 3
node scripts/local-test/seed.mjs && node scripts/local-test/seed.mjs snapshot
NODE_PATH=$(npm root -g) node scripts/local-test/journeys.cjs            # journeys 1-4
node scripts/local-test/seed.mjs compare                                  # journey 5: existing profiles unchanged
NODE_PATH=$(npm root -g) node scripts/local-test/journeys.cjs existing   # existing profiles paying
NODE_PATH=$(npm root -g) node scripts/local-test/site-audit.cjs          # public site, Acceder, modalidad journeys, footer scroll, colaboraciones
node scripts/local-test/seed.mjs                                          # reset: the runs above make a seeded profile a member
node scripts/local-test/benefits-matching.cjs                             # 20 % monthly codes (1/3/6-month plans) and matching eligibility
npx tsx --conditions=react-server scripts/local-test/benefit-cycles.test.mts   # cycle dates, no emulator needed
node scripts/local-test/events-manager.cjs                                # Events Manager APIs, public pages, 20 % switch
NODE_PATH=$(npm root -g) node scripts/local-test/events-manager-ui.cjs   # admin walk-through; creates the 29 Oct and 26 Nov events locally
npx tsx --conditions=react-server scripts/local-test/events-manager.test.mts   # link parsing, form rules, what the website shows
npx tsx --conditions=react-server scripts/local-test/deploy-env.test.mts       # staging isolation guard
npx tsx --conditions=react-server scripts/local-test/account.test.mts          # Acceder routing, modality and the matching pool
```

- Open http://localhost:3000 to click through by hand. Magic-link emails are
  not sent: the emulator UI (http://127.0.0.1:4000/auth) shows the links.
- Ticket Tailor is imitated by the same mock (`TICKET_TAILOR_LOCAL_MOCK_URL`,
  loopback only). `touch .local-test/tt-fail` makes discount creation fail.
  The Events Manager import reads `GET /v1/events/ev_2439069` from the mock:
  title, date, times and image copy the public Ticket Tailor page; ticket
  types and venue name are invented and marked MOCK. The real API response
  has not been checked yet.
- Admin dashboard: http://localhost:3000/admin, events at /admin/eventos.
  The Google button needs apis.google.com; where that is blocked, the
  walk-through signs `ADMIN_ALLOWLIST_EMAILS` into the auth emulator
  directly.
  Renewals, cancellations and time passing are simulated with
  `POST /test/subscriptions/:id/{renew,cancel,backdate?days=N}` on the mock.
- The "payment" page is a local imitation at 127.0.0.1:12111 that sends a
  signed `checkout.session.completed` webhook to the app, as Stripe does.
- Everything the app would have sent to Stripe or Brevo is in
  `.local-test/mock-log.jsonl`; screenshots go to `.local-test/shots`.
- Seed data is invented (three Introductions profiles: finished, draft,
  legacy pending). The scripts refuse to run unless the project id starts
  with `demo-` and the emulator hosts are set.
