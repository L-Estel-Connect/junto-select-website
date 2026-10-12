/**
 * READ-ONLY audit for the move from "one 20 % code per eligible event" to
 * "one code per monthly cycle". It never writes anything: run it against
 * production only with Lara's go-ahead, to size the questions in the
 * delivery report before any decision about existing codes.
 *
 *   npx tsx scripts/audit-event-benefits.mts
 *
 * Uses the ambient Firebase Admin credentials (or the emulators when
 * FIRESTORE_EMULATOR_HOST is set). Prints counts only, plus uids for the
 * members who hold more than one live code from the old engine.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp(process.env.GCLOUD_PROJECT ? { projectId: process.env.GCLOUD_PROJECT } : undefined);
const db = getFirestore();

const madridYMD = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const toDate = (v: unknown): Date | null => {
  const t = v as { toDate?: () => Date } | null;
  return t?.toDate ? t.toDate() : v instanceof Date ? v : null;
};
const today = madridYMD(new Date());

const [benefitSnap, eventSnap, billingSnap, profileSnap] = await Promise.all([
  db.collection("eventBenefits").get(),
  db.collection("eligibleTicketTailorEvents").get(),
  db.collection("billing").where("status", "in", ["active", "trialing", "past_due"]).get(),
  db.collection("profiles").where("meta.searchStatus", "==", "active_search").get(),
]);
const eventDate = new Map(eventSnap.docs.map((d) => [d.id, (d.data().eventDate as string | null) ?? null]));

const byStatus: Record<string, number> = {};
let oldEngine = 0;
let newEngine = 0;
const liveUpcomingOld = new Map<string, number>();
for (const d of benefitSnap.docs) {
  const b = d.data();
  byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
  if (b.cycleKey) {
    newEngine += 1;
    continue;
  }
  oldEngine += 1;
  const date = eventDate.get(b.ticketTailorEventId);
  if (b.status !== "invalidated" && date && date >= today) {
    liveUpcomingOld.set(b.uid, (liveUpcomingOld.get(b.uid) ?? 0) + 1);
  }
}

const anchorBySub = new Map(
  profileSnap.docs.map((d) => [d.data().meta?.matchingSubscriptionId as string | undefined, toDate(d.data().meta?.matchingAnchorAt)]),
);
let noCycleAnchor = 0;
for (const d of billingSnap.docs) {
  const b = d.data();
  if (!toDate(b.subscriptionStartedAt) && !anchorBySub.get(b.stripeSubscriptionId)) noCycleAnchor += 1;
}

const multi = [...liveUpcomingOld].filter(([, n]) => n > 1);
console.log(JSON.stringify({
  today,
  eventBenefits: { total: benefitSnap.size, byStatus, fromOldPerEventEngine: oldEngine, fromMonthlyCycleEngine: newEngine },
  oldEngineLiveCodesForUpcomingEvents: {
    codes: [...liveUpcomingOld.values()].reduce((a, n) => a + n, 0),
    members: liveUpcomingOld.size,
    membersWithMoreThanOne: multi.length,
    uidsWithMoreThanOne: multi.map(([uid, n]) => ({ uid, codes: n })),
  },
  pendingTicketTailorActivation: (byStatus.pending_external ?? 0) + (byStatus.external_sync_failed ?? 0),
  entitledMembers: billingSnap.size,
  entitledMembersWithoutKnownCycleStart: noCycleAnchor,
}, null, 2));
process.exit(0);
