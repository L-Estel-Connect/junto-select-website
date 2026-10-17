/**
 * READ-ONLY production audit: subscriptions, 20 % codes and test data.
 * It only reads (get/where); it never writes, deletes or calls any other
 * service. Run against production only with Lara's go-ahead.
 *
 *   npx tsx scripts/audit-event-benefits.mts
 *
 * Credentials: a service account with the Cloud Datastore Viewer role
 * (read-only) passed as JSON in PROD_AUDIT_CREDENTIALS, or ambient
 * Application Default Credentials, or the emulators when
 * FIRESTORE_EMULATOR_HOST is set. The key itself is never printed.
 * Output: counts, plus uids (pseudonymous ids, no names or emails) where a
 * member needs a decision.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const raw = process.env.PROD_AUDIT_CREDENTIALS;
const credentials = raw ? (JSON.parse(raw) as { project_id: string; client_email: string; private_key: string }) : null;
initializeApp(
  credentials
    ? { credential: cert({ projectId: credentials.project_id, clientEmail: credentials.client_email, privateKey: credentials.private_key }), projectId: credentials.project_id }
    : process.env.GCLOUD_PROJECT
      ? { projectId: process.env.GCLOUD_PROJECT }
      : undefined,
);
const db = getFirestore();

const madridYMD = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const toDate = (v: unknown): Date | null => {
  const t = v as { toDate?: () => Date } | null;
  return t?.toDate ? t.toDate() : v instanceof Date ? v : null;
};
const today = madridYMD(new Date());
const tally = (m: Record<string, number>, k: string) => (m[k] = (m[k] ?? 0) + 1);

const [benefitSnap, eventSnap, billingSnap, profileSnap, cycleSnap] = await Promise.all([
  db.collection("eventBenefits").get(),
  db.collection("eligibleTicketTailorEvents").get(),
  db.collection("billing").get(),
  db.collection("profiles").where("meta.searchStatus", "==", "active_search").get(),
  db.collection("eventBenefitCycles").get(),
]);
const eventDate = new Map(eventSnap.docs.map((d) => [d.id, (d.data().eventDate as string | null) ?? null]));

// ---- Subscriptions ----
const ENTITLED = new Set(["active", "trialing", "past_due"]);
const billingByStatus: Record<string, number> = {};
const entitledByPlan: Record<string, number> = {};
let cancelAtPeriodEnd = 0;
const entitled = billingSnap.docs.filter((d) => {
  const b = d.data();
  tally(billingByStatus, String(b.status ?? "none"));
  if (!ENTITLED.has(b.status)) return false;
  tally(entitledByPlan, String(b.planKey ?? "unknown"));
  if (b.cancelAtPeriodEnd) cancelAtPeriodEnd += 1;
  return true;
});
const anchorBySub = new Map(
  profileSnap.docs.map((d) => [d.data().meta?.matchingSubscriptionId as string | undefined, toDate(d.data().meta?.matchingAnchorAt)]),
);
const withoutCycleStart = entitled
  .filter((d) => !toDate(d.data().subscriptionStartedAt))
  .map((d) => ({ uid: d.id, fallbackFromMatchingAnchor: !!anchorBySub.get(d.data().stripeSubscriptionId) }));

// ---- 20 % codes ----
// There is no "used" status (Ticket Tailor redemptions are not mirrored),
// so "unused" here means: not invalidated and its event has not happened yet.
const byStatus: Record<string, number> = {};
let oldEngine = 0;
let newEngine = 0;
const liveUpcoming = { oldEngine: 0, monthlyEngine: 0 };
const liveUpcomingOldByUid = new Map<string, number>();
const pendingRetry: { uid: string; ticketTailorEventId: string; status: string; eventDate: string | null }[] = [];
for (const d of benefitSnap.docs) {
  const b = d.data();
  tally(byStatus, String(b.status));
  const date = eventDate.get(b.ticketTailorEventId) ?? null;
  const upcoming = !!date && date >= today;
  if (b.cycleKey) newEngine += 1;
  else oldEngine += 1;
  if (b.status === "pending_external" || b.status === "external_sync_failed") {
    pendingRetry.push({ uid: b.uid, ticketTailorEventId: b.ticketTailorEventId, status: b.status, eventDate: date });
  }
  if (b.status !== "invalidated" && upcoming) {
    if (b.cycleKey) liveUpcoming.monthlyEngine += 1;
    else {
      liveUpcoming.oldEngine += 1;
      liveUpcomingOldByUid.set(b.uid, (liveUpcomingOldByUid.get(b.uid) ?? 0) + 1);
    }
  }
}
const multi = [...liveUpcomingOldByUid].filter(([, n]) => n > 1);

// ---- Events and test data that must never be in production ----
const TEST_EVENT = /prueba|sin beneficio|test|mock/i;
const testEvents = eventSnap.docs
  .filter((d) => /^tt-e\d|^em-|^9100\d{3}$/.test(d.id) || TEST_EVENT.test(String(d.data().label ?? "")))
  .map((d) => ({ id: d.id, label: d.data().label }));
const allProfiles = await db.collection("profiles").select("visible.firstName").get();
const testProfiles = allProfiles.docs
  .filter((d) => /^(intro-|bm-|em-)/.test(d.id) || /^Prueba\b/.test(String(d.get("visible.firstName") ?? "")))
  .map((d) => d.id);

console.log(JSON.stringify({
  project: credentials?.project_id ?? process.env.GCLOUD_PROJECT ?? "(ambient)",
  today,
  subscriptions: {
    billingRecordsByStatus: billingByStatus,
    entitledNow: entitled.length,
    entitledByPlan,
    entitledCancellingAtPeriodEnd: cancelAtPeriodEnd,
    entitledWithoutSubscriptionStartedAt: withoutCycleStart.length,
    entitledWithoutStartAndNoFallback: withoutCycleStart.filter((x) => !x.fallbackFromMatchingAnchor).map((x) => x.uid),
  },
  codes: {
    total: benefitSnap.size,
    byStatus,
    fromOldPerEventEngine: oldEngine,
    fromMonthlyCycleEngine: newEngine,
    monthlyCyclesClaimed: cycleSnap.size,
    liveForUpcomingEvents: liveUpcoming,
    membersWithMoreThanOneLiveOldCode: multi.map(([uid, n]) => ({ uid, codes: n })),
    pendingTicketTailorRetry: pendingRetry,
  },
  events: {
    total: eventSnap.size,
    published: eventSnap.docs.filter((d) => d.data().published === true).length,
    testLookingEvents: testEvents,
  },
  testLookingProfiles: testProfiles,
}, null, 2));
process.exit(0);
