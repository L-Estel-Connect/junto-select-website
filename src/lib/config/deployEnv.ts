/**
 * Staging isolation guard. A staging deployment sets
 * `JUNTO_DEPLOY_ENV=staging` (apphosting.staging.yaml). In that mode the app
 * refuses, in code, anything that could reach a live service or a real
 * customer, whatever else is misconfigured:
 *   - the production Firebase project (select-dev-508407);
 *   - a Stripe key that is not a test key;
 *   - any Brevo call (contacts, lists, emails);
 *   - any Ticket Tailor write (discount codes). Read-only event lookups are
 *     still allowed, for the Events Manager import.
 * Unset everywhere else, so production and local testing are unaffected.
 */
export const PRODUCTION_FIREBASE_PROJECT_ID = "select-dev-508407";

export function isStagingDeploy(): boolean {
  return process.env.JUNTO_DEPLOY_ENV === "staging";
}

export class StagingIsolationError extends Error {}

/** Every project id the Firebase SDKs could resolve to. */
function configuredProjectIds(): string[] {
  return [
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    process.env.GOOGLE_CLOUD_PROJECT,
    process.env.GCLOUD_PROJECT,
    (() => {
      try {
        return (JSON.parse(process.env.FIREBASE_CONFIG ?? "{}") as { projectId?: string }).projectId;
      } catch {
        return undefined;
      }
    })(),
  ].filter((v): v is string => !!v);
}

/** Throws when a staging deployment is pointed at the production Firebase project. */
export function assertNotProductionFirebase(): void {
  if (!isStagingDeploy()) return;
  if (configuredProjectIds().includes(PRODUCTION_FIREBASE_PROJECT_ID)) {
    throw new StagingIsolationError(`staging must not use the production Firebase project ${PRODUCTION_FIREBASE_PROJECT_ID}`);
  }
}

/** Throws when a staging deployment is given a live Stripe key. */
export function assertStripeKeyAllowed(key: string): void {
  if (isStagingDeploy() && !key.startsWith("sk_test_")) {
    throw new StagingIsolationError("staging accepts Stripe test keys (sk_test_) only");
  }
}
