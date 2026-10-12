// Pure tests for the staging isolation guard (no emulator needed):
//   npx tsx --conditions=react-server scripts/local-test/deploy-env.test.mts
import { assertNotProductionFirebase, assertStripeKeyAllowed, isStagingDeploy } from "../../src/lib/config/deployEnv";

let failed = 0;
function check(name: string, ok: boolean) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
const throws = (fn: () => void) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
const keys = ["JUNTO_DEPLOY_ENV", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT", "FIREBASE_CONFIG"];
const reset = () => keys.forEach((k) => delete process.env[k]);

reset();
check("off by default", !isStagingDeploy());
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "select-dev-508407";
check("production project allowed outside staging", !throws(assertNotProductionFirebase));
check("live Stripe key allowed outside staging", !throws(() => assertStripeKeyAllowed("sk_live_x")));

process.env.JUNTO_DEPLOY_ENV = "staging";
check("staging: production project refused (public config)", throws(assertNotProductionFirebase));
reset();
process.env.JUNTO_DEPLOY_ENV = "staging";
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "select-dev-508407" });
check("staging: production project refused (App Hosting config)", throws(assertNotProductionFirebase));
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "junto-select-staging" });
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "junto-select-staging";
check("staging: separate project allowed", !throws(assertNotProductionFirebase));
check("staging: live Stripe key refused", throws(() => assertStripeKeyAllowed("sk_live_x")));
check("staging: restricted live key refused", throws(() => assertStripeKeyAllowed("rk_live_x")));
check("staging: test key allowed", !throws(() => assertStripeKeyAllowed("sk_test_x")));
reset();

console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
process.exit(failed ? 1 : 0);
