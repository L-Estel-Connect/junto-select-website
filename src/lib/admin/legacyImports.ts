import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";
import type { LegacyImportDocument, LegacyImportStatus } from "@/lib/legacyImport/types";

/**
 * Admin-only read surface for `legacyImports` — deliberately separate
 * from `profiles.ts` (a legacy import is not a profile until claimed).
 * V1-scale: one bounded collection read, exactly like `listAllProfiles`.
 */

export type LegacyImportDisplayStatus = LegacyImportStatus;

export interface LegacyImportRow {
  id: string;
  normalizedEmail: string;
  firstName: string | null;
  /**
   * DERIVED, never trusted from the stored `status` field alone once a
   * contact has been claimed: once `claimedUid` is set, this looks up
   * the live `profiles/{claimedUid}` document and reports "activated"
   * only if `meta.onboardingFinalized` is actually true right now — the
   * same "recompute from real data, don't trust a possibly-stale stored
   * flag" principle `diagnoseProfileStatus` already applies elsewhere in
   * this admin dashboard (see completion.ts). The stored `status` field
   * only ever needs to reach "claimed"; this display status is what
   * shows "activated" once onboarding is genuinely finished.
   */
  displayStatus: LegacyImportDisplayStatus;
  warningsCount: number;
  claimedUid: string | null;
  importedAt: string | null;
  emailQueuedAt: string | null;
  claimedAt: string | null;
}

function isoOrNull(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

export async function listLegacyImports(): Promise<LegacyImportRow[]> {
  const snap = await adminDb.collection("legacyImports").limit(5000).get();
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as LegacyImportDocument }));

  const claimedUids = docs.map((d) => d.data.claimedUid).filter((uid): uid is string => Boolean(uid));
  const profileByUid = new Map<string, ProfileDocument>();
  if (claimedUids.length > 0) {
    const refs = claimedUids.map((uid) => adminDb.doc(`profiles/${uid}`));
    const profileSnaps = await adminDb.getAll(...refs);
    profileSnaps.forEach((s) => {
      if (s.exists) profileByUid.set(s.id, withProfileDefaults(s.id, s.data() as Partial<ProfileDocument>));
    });
  }

  return docs.map(({ id, data }) => {
    let displayStatus: LegacyImportDisplayStatus = data.status;
    if (data.claimedUid) {
      const profile = profileByUid.get(data.claimedUid);
      displayStatus = profile?.meta.onboardingFinalized ? "activated" : "claimed";
    }
    return {
      id,
      normalizedEmail: data.normalizedEmail,
      firstName: data.prefill.firstName,
      displayStatus,
      warningsCount: data.warnings?.length ?? 0,
      claimedUid: data.claimedUid,
      importedAt: isoOrNull(data.importedAt),
      emailQueuedAt: isoOrNull(data.emailQueuedAt),
      claimedAt: isoOrNull(data.claimedAt),
    };
  });
}
