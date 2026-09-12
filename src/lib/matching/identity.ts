import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { ProfileDocument } from "@/lib/introduction/types";
import type { PersonDocument } from "./types";

/**
 * The matching engine must operate on unique real people, not unique
 * Firebase UIDs — see README "Duplicate accounts / profile integrity".
 * Every profile defaults to personId === its own uid (the common case).
 * `people/{personId}` only gets a document once an actual merge happens;
 * there is deliberately no bulk backfill job creating one per user, since
 * that would be a large write fan-out for a case (no merges yet) that
 * doesn't need it.
 */
export function resolvePersonId(uid: string, profile: Pick<ProfileDocument, "meta">): string {
  return profile.meta.personId || uid;
}

/**
 * Links a secondary (duplicate) account to a primary one: two Firebase
 * UIDs, one real person. This is the only place `people/{personId}` is
 * written and the only place a profile's `duplicateStatus` is ever set to
 * `confirmed_duplicate` — always an explicit, human-triggered call (via
 * the admin API route), never automatic from a heuristic alone.
 *
 * `personId` is always `primaryUid` by convention, so most reads never
 * need to look at `people/` at all — only a profile that has actually been
 * involved in a merge has personId !== its own uid.
 */
export async function mergePeople(
  primaryUid: string,
  secondaryUid: string,
): Promise<void> {
  if (primaryUid === secondaryUid) {
    throw new Error("cannot merge an account into itself");
  }

  const personId = primaryUid;
  const personRef = adminDb.doc(`people/${personId}`);
  const primaryProfileRef = adminDb.doc(`profiles/${primaryUid}`);
  const secondaryProfileRef = adminDb.doc(`profiles/${secondaryUid}`);

  await adminDb.runTransaction(async (tx) => {
    const [personSnap, primarySnap, secondarySnap] = await Promise.all([
      tx.get(personRef),
      tx.get(primaryProfileRef),
      tx.get(secondaryProfileRef),
    ]);

    if (!primarySnap.exists) throw new Error(`primary profile ${primaryUid} not found`);
    if (!secondarySnap.exists) throw new Error(`secondary profile ${secondaryUid} not found`);

    const now = FieldValue.serverTimestamp();
    const existing = personSnap.exists ? (personSnap.data() as PersonDocument) : null;
    const linkedUids = Array.from(
      new Set([...(existing?.linkedUids ?? [primaryUid]), primaryUid, secondaryUid]),
    );

    tx.set(personRef, {
      primaryUid,
      linkedUids,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies Omit<PersonDocument, "createdAt" | "updatedAt"> & {
      createdAt: unknown;
      updatedAt: unknown;
    });

    tx.update(primaryProfileRef, {
      "meta.personId": personId,
      "meta.updatedAt": now,
    });

    tx.update(secondaryProfileRef, {
      "meta.personId": personId,
      "meta.duplicateStatus": "confirmed_duplicate",
      "meta.duplicateOf": primaryUid,
      "meta.updatedAt": now,
    });
  });
}
