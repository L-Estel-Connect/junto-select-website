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
NODE_PATH=$(npm root -g) node scripts/local-test/site-audit.cjs          # v5 public site: links, CTAs, fonts, free profile, colaboraciones
```

- Open http://localhost:3000 to click through by hand. Magic-link emails are
  not sent: the emulator UI (http://127.0.0.1:4000/auth) shows the links.
- The "payment" page is a local imitation at 127.0.0.1:12111 that sends a
  signed `checkout.session.completed` webhook to the app, as Stripe does.
- Everything the app would have sent to Stripe or Brevo is in
  `.local-test/mock-log.jsonl`; screenshots go to `.local-test/shots`.
- Seed data is invented (three Introductions profiles: finished, draft,
  legacy pending). The scripts refuse to run unless the project id starts
  with `demo-` and the emulator hosts are set.
