import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { getAge } from "@/lib/introduction/age";
import type { DuplicateStatus, Gender, ProfileDocument, ProfileStatus, SearchStatus } from "@/lib/introduction/types";
import { withProfileDefaults } from "@/lib/introduction/types";
import { resolvePersonId } from "@/lib/matching/identity";
import { isProfileInEligiblePool } from "@/lib/matching/eligibility";

/**
 * V1-scale data access: a single bounded `.get()` on `profiles`, filtered
 * and paginated IN MEMORY by the caller. This intentionally avoids
 * building composite Firestore indexes for every filter combination the
 * dashboard offers — at the member counts this product has in V1, one
 * full collection read per admin request is the smallest sensible
 * approach (see README §16 / Admin Dashboard spec §16), and it still never
 * ships more than one page of results to the browser. Revisit with real
 * server-side query pagination if the member base grows enough for this
 * to matter.
 */
export interface ProfileRow {
  uid: string;
  profile: ProfileDocument;
}

/**
 * Every raw Firestore profile doc is normalized through `withProfileDefaults`
 * here — the SAME normalization the matching engine (`loadEligiblePool`) and
 * the client onboarding read path apply, so a legacy document (an old field
 * name, a missing newer sub-object) can never look different — or, for the
 * young-children dealbreaker specifically, look unanswered when it isn't —
 * depending on which part of the app happens to be reading it. Consistency
 * audit finding: this previously cast the raw doc directly, so the admin
 * dashboard's OWN `dealbreakers`/`preferences` display (and nothing else,
 * since `isProfileInEligiblePool`'s checks all happen to be null/undefined-
 * safe by loose equality) could silently disagree with what a member
 * actually sees and answered.
 */
export async function listAllProfiles(): Promise<ProfileRow[]> {
  const snap = await adminDb.collection("profiles").limit(5000).get();
  return snap.docs.map((doc) => ({
    uid: doc.id,
    profile: withProfileDefaults(doc.id, doc.data() as Partial<ProfileDocument>),
  }));
}

export async function getProfileRow(uid: string): Promise<ProfileRow | null> {
  const snap = await adminDb.doc(`profiles/${uid}`).get();
  if (!snap.exists) return null;
  return { uid, profile: withProfileDefaults(uid, snap.data() as Partial<ProfileDocument>) };
}

export function ageOf(profile: ProfileDocument): number | null {
  const bd = profile.private.birthDate;
  if (!bd) return null;
  return getAge(bd.toDate().toISOString().slice(0, 10));
}

/** personId -> {uid, profile}, built from the same field every matching module already uses (profile.meta.personId). No extra `people/` reads needed. */
export function buildPersonIndex(rows: ProfileRow[]): Map<string, ProfileRow> {
  const index = new Map<string, ProfileRow>();
  for (const row of rows) {
    const personId = resolvePersonId(row.uid, row.profile);
    if (!index.has(personId)) index.set(personId, row);
  }
  return index;
}

/** uids that appear in at least one still-open duplicateCandidates entry. */
export async function loadSuspectedDuplicateUids(): Promise<Set<string>> {
  const snap = await adminDb.collection("duplicateCandidates").where("status", "==", "open").get();
  const uids = new Set<string>();
  for (const doc of snap.docs) {
    const data = doc.data();
    uids.add(data.uidLow as string);
    uids.add(data.uidHigh as string);
  }
  return uids;
}

export interface MemberSummary {
  uid: string;
  personId: string;
  firstName: string;
  age: number | null;
  gender: Gender | null;
  city: string;
  photoPath: string | null;
  profileStatus: ProfileStatus;
  searchStatus: SearchStatus;
  /** Would actually be drawn into the matching pool right now (active_for_matching + Madrid + not duplicate-excluded). */
  eligibleForMatching: boolean;
  duplicateStatus: DuplicateStatus;
  suspectedDuplicate: boolean;
  createdAt: string | null;
}

export function toMemberSummary(
  uid: string,
  profile: ProfileDocument,
  suspectedDuplicateUids: Set<string>,
): MemberSummary {
  const createdAt = profile.meta.createdAt as { toDate?: () => Date } | undefined;
  return {
    uid,
    personId: resolvePersonId(uid, profile),
    firstName: profile.visible.firstName,
    age: ageOf(profile),
    gender: profile.visible.gender,
    city: profile.visible.city,
    photoPath: profile.photos[0] ?? null,
    profileStatus: profile.meta.profileStatus,
    searchStatus: profile.meta.searchStatus,
    eligibleForMatching:
      profile.meta.profileStatus === "active_for_matching" && isProfileInEligiblePool(profile),
    duplicateStatus: profile.meta.duplicateStatus,
    suspectedDuplicate: suspectedDuplicateUids.has(uid),
    createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : null,
  };
}
