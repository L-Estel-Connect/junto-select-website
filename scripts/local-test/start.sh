#!/usr/bin/env bash
# Starts the mock Stripe/Brevo service and `next start` with .env.local.
# Run the Firebase emulators first:
#   firebase emulators:start --project demo-junto-select --only auth,firestore,storage
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p .local-test
set -a; . ./.env.local; set +a
node scripts/local-test/mock-services.mjs > .local-test/mock.log 2>&1 &
exec npx next start -p 3000
