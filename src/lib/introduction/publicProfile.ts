import { getAge } from "./age";
import type {
  ActivityLevel,
  ContactMethod,
  ContactPreferences,
  EducationLevel,
  FrequencyLevel,
  ProfileDocument,
  RelationshipIntention,
} from "./types";

/**
 * Exactly what a proposal/invitation/introduction may show about the OTHER
 * party — the member-facing lifecycle's one and only shape for "someone
 * else's profile." Deliberately mirrors what ProfileCard.tsx already reads
 * for "Ver mi perfil" (profile.visible + photos + approved presentation
 * text) and nothing more: never `dealbreakers`, `preferences`, `private`
 * (beyond the derived age), `contactPreferences`, or any `meta` field
 * (searchStatus, profileStatus, personId, admin/matching bookkeeping).
 * Building this is the one place that enforces "the candidate/inviter
 * never sees private matching criteria, score, or admin metadata" for the
 * whole member lifecycle — every API route funnels through this instead of
 * ever forwarding a raw ProfileDocument to the client.
 */
export interface PublicProfileView {
  uid: string;
  firstName: string;
  age: number | null;
  city: string;
  profession: string;
  educationLevel: EducationLevel | null;
  heightCm: number | null;
  languages: string[];
  hasChildren: boolean | null;
  childrenCount: number | null;
  relationshipIntention: RelationshipIntention | null;
  smoking: FrequencyLevel | null;
  drinking: FrequencyLevel | null;
  activityLevel: ActivityLevel | null;
  /** Storage paths — fetched through /api/member/photo, never a direct download URL. */
  photos: string[];
  presentationText: string | null;
}

export function buildPublicProfileView(uid: string, profile: ProfileDocument): PublicProfileView {
  const age = profile.private.birthDate
    ? getAge(profile.private.birthDate.toDate().toISOString().slice(0, 10))
    : null;
  return {
    uid,
    firstName: profile.visible.firstName,
    age,
    city: profile.visible.city,
    profession: profile.visible.profession,
    educationLevel: profile.visible.educationLevel,
    heightCm: profile.visible.heightCm,
    languages: profile.visible.languages,
    hasChildren: profile.visible.hasChildren,
    childrenCount: profile.visible.childrenCount,
    relationshipIntention: profile.visible.relationshipIntention,
    smoking: profile.visible.smoking,
    drinking: profile.visible.drinking,
    activityLevel: profile.visible.activityLevel,
    photos: profile.photos,
    presentationText: profile.presentation.approvedText,
  };
}

export interface RevealedContact {
  method: ContactMethod;
  label: string;
  value: string;
}

const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  whatsapp: "WhatsApp",
  telefono: "Teléfono",
  email: "Email",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

/**
 * Only after a mutual introduction: exactly the contact methods this
 * person actually filled in AND listed (as preferred or additional) —
 * never all of `contactPreferences`, never a method with no stored value.
 * `email` resolves to the account's own Firebase Auth email (see
 * ContactPreferences' doc comment: there is no separate stored contact
 * email field on purpose), passed in by the caller since that lookup needs
 * the Admin Auth SDK, not Firestore.
 */
export function buildRevealedContacts(
  prefs: ContactPreferences,
  accountEmail: string | null,
): RevealedContact[] {
  const methods = [prefs.preferredMethod, ...prefs.additionalMethods].filter(
    (m): m is ContactMethod => m !== null,
  );
  const uniqueMethods = [...new Set(methods)];

  const contacts: RevealedContact[] = [];
  for (const method of uniqueMethods) {
    let value: string | null = null;
    if (method === "whatsapp" || method === "telefono") value = prefs.phone;
    else if (method === "instagram") value = prefs.instagram;
    else if (method === "linkedin") value = prefs.linkedin;
    else if (method === "email") value = accountEmail;

    if (value && value.trim()) {
      contacts.push({ method, label: CONTACT_METHOD_LABELS[method], value: value.trim() });
    }
  }
  return contacts;
}
