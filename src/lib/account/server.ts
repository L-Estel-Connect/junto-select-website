import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { isEntitledStatus, type BillingDocument } from "@/lib/billing/types";
import { withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";

/** Reads (never creates) the profile and the membership state of one account. */
export async function loadAccountState(uid: string): Promise<{ profile: ProfileDocument | null; entitled: boolean }> {
  const [profileSnap, billingSnap] = await Promise.all([
    adminDb.doc(`profiles/${uid}`).get(),
    adminDb.doc(`billing/${uid}`).get(),
  ]);
  const profile = profileSnap.exists ? withProfileDefaults(uid, profileSnap.data() as Partial<ProfileDocument>) : null;
  const billing = billingSnap.exists ? (billingSnap.data() as BillingDocument) : null;
  return { profile, entitled: !!billing && isEntitledStatus(billing.status) };
}
