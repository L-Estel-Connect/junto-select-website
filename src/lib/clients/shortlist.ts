import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getAge } from "@/lib/introduction/age";
import { withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";
import { resolvePersonId } from "@/lib/matching/identity";
import type { ShortlistEntryView, ShortlistStatus } from "./types";

/**
 * A client's manual shortlist: `clientShortlist/{clientId}_{personId}`,
 * server-only. One document per (client, real person), so the same
 * candidate can never be on a client's list twice, even through a second
 * account merged into the same person. Nothing here contacts anyone: every
 * status is set by hand after the team has spoken to people.
 *
 * Only ids, the status and the team's note are stored. Name, age, city and
 * photo are read live from the candidate's profile, so when a candidate
 * deletes their profile they disappear from every list (see
 * removeCandidateFromShortlists, called by /api/member/delete-profile).
 */

export const SHORTLIST = "clientShortlist";

function iso(v: unknown): string | null {
  return v instanceof Timestamp ? v.toDate().toISOString() : null;
}

export function shortlistId(clientId: string, personId: string): string {
  return `${clientId}_${personId}`;
}

async function profileFor(uid: string): Promise<ProfileDocument | null> {
  const snap = await adminDb.doc(`profiles/${uid}`).get();
  return snap.exists ? withProfileDefaults(uid, snap.data() as Partial<ProfileDocument>) : null;
}

export async function addToShortlist(
  clientId: string,
  candidateUid: string,
  score: number | null,
  adminEmail: string,
): Promise<{ ok: true; id: string; already: boolean } | { ok: false; error: "candidate_not_found" }> {
  const profile = await profileFor(candidateUid);
  if (!profile) return { ok: false, error: "candidate_not_found" };
  const personId = resolvePersonId(candidateUid, profile);
  const id = shortlistId(clientId, personId);
  const ref = adminDb.collection(SHORTLIST).doc(id);
  try {
    await ref.create({
      clientId,
      personId,
      candidateUid,
      status: "preseleccionado" satisfies ShortlistStatus,
      note: "",
      scoreWhenAdded: score,
      deletedCandidate: false,
      createdBy: adminEmail,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, id, already: false };
  } catch {
    // Already on the list: one-click shortlisting is idempotent.
    if ((await ref.get()).exists) return { ok: true, id, already: true };
    throw new Error("shortlist_create_failed");
  }
}

export async function updateShortlistEntry(
  clientId: string,
  entryId: string,
  patch: { status?: ShortlistStatus; note?: string },
  adminEmail: string,
): Promise<"ok" | "not_found"> {
  const ref = adminDb.collection(SHORTLIST).doc(entryId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.clientId !== clientId) return "not_found";
  await ref.update({ ...patch, updatedBy: adminEmail, updatedAt: FieldValue.serverTimestamp() });
  return "ok";
}

export async function removeFromShortlist(clientId: string, entryId: string): Promise<"ok" | "not_found"> {
  const ref = adminDb.collection(SHORTLIST).doc(entryId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.clientId !== clientId) return "not_found";
  await ref.delete();
  return "ok";
}

export interface RawShortlistEntry {
  id: string;
  clientId: string;
  personId: string | null;
  candidateUid: string | null;
  status: ShortlistStatus;
  note: string;
  scoreWhenAdded: number | null;
  deletedCandidate: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

function toRaw(doc: FirebaseFirestore.QueryDocumentSnapshot): RawShortlistEntry {
  const d = doc.data();
  return {
    id: doc.id,
    clientId: d.clientId,
    personId: d.personId ?? null,
    candidateUid: d.candidateUid ?? null,
    status: d.status,
    note: d.note ?? "",
    scoreWhenAdded: typeof d.scoreWhenAdded === "number" ? d.scoreWhenAdded : null,
    deletedCandidate: d.deletedCandidate === true,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export async function loadShortlistEntries(clientId?: string): Promise<RawShortlistEntry[]> {
  const q = clientId
    ? adminDb.collection(SHORTLIST).where("clientId", "==", clientId)
    : adminDb.collection(SHORTLIST);
  const snap = await q.get();
  return snap.docs.map(toRaw);
}

export async function getShortlist(clientId: string): Promise<ShortlistEntryView[]> {
  const entries = await loadShortlistEntries(clientId);
  const views = await Promise.all(
    entries.map(async (e): Promise<ShortlistEntryView | null> => {
      const profile = e.candidateUid ? await profileFor(e.candidateUid) : null;
      // Deleted profile: gone from the list, unless it was an actual
      // introduction, which stays as an anonymous line for the count.
      if (!profile && !e.deletedCandidate) return null;
      const bd = profile?.private.birthDate;
      return {
        ...e,
        candidate: profile
          ? {
              firstName: profile.visible.firstName,
              age: bd ? getAge(bd.toDate().toISOString().slice(0, 10)) : null,
              city: profile.visible.city,
              photoPath: profile.photos[0] ?? null,
            }
          : null,
      };
    }),
  );
  const order: ShortlistStatus[] = ["presentado", "interesado", "contactado", "preseleccionado", "rechazado"];
  return views
    .filter((v): v is ShortlistEntryView => v !== null)
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

/**
 * A candidate deleted their profile: remove them from every client's
 * shortlist. An entry already marked "presentado" (a real introduction
 * that counts toward a programme's limit) is replaced by an anonymous line
 * with no ids and no note, so a client's count stays right without keeping
 * anything that identifies the person.
 */
export async function removeCandidateFromShortlists(uid: string): Promise<number> {
  const snap = await adminDb.collection(SHORTLIST).where("candidateUid", "==", uid).get();
  const batch = adminDb.batch();
  for (const doc of snap.docs) {
    const d = doc.data();
    batch.delete(doc.ref);
    if (d.status === "presentado") {
      batch.set(adminDb.collection(SHORTLIST).doc(), {
        clientId: d.clientId,
        personId: null,
        candidateUid: null,
        status: "presentado",
        note: "",
        scoreWhenAdded: null,
        deletedCandidate: true,
        createdAt: d.createdAt ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
  if (!snap.empty) await batch.commit();
  return snap.size;
}
