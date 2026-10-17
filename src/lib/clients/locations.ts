import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getPlace, type Place } from "@/lib/geo/places";

/**
 * The team's answer for a candidate whose city can't be placed on its own
 * ("Villanueva", a typo): `candidateLocations/{uid}`, server-only. Stored
 * apart from the profile, so the candidate's own answer is never edited,
 * and tied to the exact text it answers: if the candidate later changes
 * their city, the old choice no longer applies.
 */

export const CANDIDATE_LOCATIONS = "candidateLocations";

export async function loadConfirmedPlaces(): Promise<Map<string, { place: Place; cityText: string }>> {
  const snap = await adminDb.collection(CANDIDATE_LOCATIONS).get();
  const map = new Map<string, { place: Place; cityText: string }>();
  for (const doc of snap.docs) {
    const d = doc.data();
    const place = getPlace(typeof d.ine === "string" ? d.ine : null);
    if (place && typeof d.cityText === "string") map.set(doc.id, { place, cityText: d.cityText });
  }
  return map;
}

export async function setConfirmedPlace(uid: string, ine: string | null, adminEmail: string): Promise<"ok" | "not_found" | "invalid_place"> {
  const profile = await adminDb.doc(`profiles/${uid}`).get();
  if (!profile.exists) return "not_found";
  const ref = adminDb.collection(CANDIDATE_LOCATIONS).doc(uid);
  if (ine === null) {
    await ref.delete();
    return "ok";
  }
  if (!getPlace(ine)) return "invalid_place";
  const cityText = (profile.data()?.visible?.city as string | undefined) ?? "";
  await ref.set({ ine, cityText, setBy: adminEmail, setAt: FieldValue.serverTimestamp() });
  return "ok";
}
