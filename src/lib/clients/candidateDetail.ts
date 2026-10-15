import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { getAge } from "@/lib/introduction/age";
import { withProfileDefaults, type ContactPreferences, type ProfileDocument } from "@/lib/introduction/types";
import { evaluateHardFiltersDetailed, type HardFilterFailure } from "@/lib/matching/hardFilters";
import { scorePair } from "@/lib/matching/scoring";
import { computeMatchWhy, type MatchWhy } from "@/lib/admin/why";
import { attachConfirmedPlace, resolveProfileLocation } from "@/lib/geo/profileLocation";
import { distanceKm, getPlace } from "@/lib/geo/places";
import { clientAsProfile } from "./matchProfile";
import { CANDIDATE_LOCATIONS } from "./locations";
import type { ClientView } from "./types";
import type { PlaceSummary } from "./search";

/**
 * Everything the side panel shows about one candidate for one client: the
 * profile as the candidate wrote it, their approved presentation, how to
 * reach them, what they themselves are looking for, and the same
 * reciprocal check and score explanation as the results list.
 *
 * Income and the exact birth date are never included (only the age), the
 * same data minimisation as the existing member page (memberDetail.ts).
 */
export interface CandidateDetail {
  uid: string;
  firstName: string;
  age: number | null;
  city: string;
  place: PlaceSummary | null;
  distanceKm: number | null;
  photos: string[];
  visible: Pick<
    ProfileDocument["visible"],
    | "gender"
    | "profession"
    | "educationLevel"
    | "heightCm"
    | "languages"
    | "hasChildren"
    | "hasYoungChildren"
    | "wantsFutureChildren"
    | "relationshipIntention"
    | "smoking"
    | "drinking"
    | "activityLevel"
    | "marketAvailability"
  >;
  presentation: string | null;
  lookingFor: Pick<ProfileDocument["dealbreakers"], "gendersSought" | "ageMin" | "ageMax" | "maxDistance" | "relationshipIntentionsAccepted" | "smokingAccepted" | "partnerYoungChildrenMatters"> &
    Pick<ProfileDocument["preferences"], "heightMinCm" | "heightMaxCm" | "drinkingAccepted" | "activityLevelsPreferred">;
  contact: ContactPreferences & { email: string | null };
  failures: HardFilterFailure[];
  why: MatchWhy | null;
  membership: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

function isoOf(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

export async function getCandidateDetail(client: ClientView, uid: string): Promise<CandidateDetail | null> {
  if (!uid || uid.includes("/")) return null;
  const [snap, userSnap, locSnap] = await Promise.all([
    adminDb.doc(`profiles/${uid}`).get(),
    adminDb.doc(`users/${uid}`).get(),
    adminDb.collection(CANDIDATE_LOCATIONS).doc(uid).get(),
  ]);
  if (!snap.exists) return null;
  const profile = withProfileDefaults(uid, snap.data() as Partial<ProfileDocument>);
  const confirmed = locSnap.exists ? locSnap.data() : null;
  if (confirmed && confirmed.cityText === profile.visible.city) attachConfirmedPlace(profile, getPlace(confirmed.ine));

  const me = clientAsProfile(client);
  const failures = evaluateHardFiltersDetailed(me, profile);
  const score = failures.length === 0 ? scorePair(me, profile) : null;
  const loc = resolveProfileLocation(profile);
  const place = loc.status === "resolved" ? loc.place : null;
  const clientPlace = getPlace(client.placeIne);
  const bd = profile.private.birthDate;
  const v = profile.visible;
  const d = profile.dealbreakers;
  const p = profile.preferences;

  return {
    uid,
    firstName: v.firstName,
    age: bd ? getAge(bd.toDate().toISOString().slice(0, 10)) : null,
    city: v.city,
    place: place ? { ine: place.ine, name: place.name, province: place.province, community: place.community } : null,
    distanceKm: place && clientPlace ? Math.round(distanceKm(place, clientPlace)) : null,
    photos: profile.photos,
    visible: {
      gender: v.gender,
      profession: v.profession,
      educationLevel: v.educationLevel,
      heightCm: v.heightCm,
      languages: v.languages,
      hasChildren: v.hasChildren,
      hasYoungChildren: v.hasYoungChildren,
      wantsFutureChildren: v.wantsFutureChildren,
      relationshipIntention: v.relationshipIntention,
      smoking: v.smoking,
      drinking: v.drinking,
      activityLevel: v.activityLevel,
      marketAvailability: v.marketAvailability,
    },
    presentation: profile.presentation.status === "approved" ? profile.presentation.approvedText : null,
    lookingFor: {
      gendersSought: d.gendersSought,
      ageMin: d.ageMin,
      ageMax: d.ageMax,
      maxDistance: d.maxDistance,
      relationshipIntentionsAccepted: d.relationshipIntentionsAccepted,
      smokingAccepted: d.smokingAccepted,
      partnerYoungChildrenMatters: d.partnerYoungChildrenMatters,
      heightMinCm: p.heightMinCm,
      heightMaxCm: p.heightMaxCm,
      drinkingAccepted: p.drinkingAccepted,
      activityLevelsPreferred: p.activityLevelsPreferred,
    },
    contact: { ...profile.contactPreferences, email: (userSnap.data()?.email as string | undefined) ?? null },
    failures,
    why: score ? computeMatchWhy(score) : null,
    membership: profile.meta.searchStatus === "active_search",
    createdAt: isoOf(profile.meta.createdAt),
    updatedAt: isoOf(profile.meta.updatedAt),
  };
}
