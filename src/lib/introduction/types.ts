import type { Timestamp } from "firebase/firestore";

export type Gender = "mujer" | "hombre";

export type EducationLevel =
  | "formacion_profesional"
  | "universidad"
  | "master_doctorado"
  | "prefiero_no_decirlo";

export type IncomeRange =
  | "menos_40k"
  | "40k_80k"
  | "80k_150k"
  | "mas_150k"
  | "prefiero_no_decirlo";

export type RelationshipIntention =
  | "relacion_seria"
  | "matrimonio_familia"
  | "aun_no_lo_tengo_claro";

export type FrequencyLevel = "no" | "socialmente" | "habitualmente";

export type ActivityLevel =
  | "muy_activo"
  | "activo"
  | "ocasional"
  | "poco_activo";

export type DistancePreference = "misma_ciudad" | "hasta_50km" | "sin_limite";

export type FutureChildrenPreference = "si" | "no" | "indiferente";

/**
 * "Lo que buscas" — matching criteria, split the same way the product
 * distinguishes them: `dealbreakers` are hard filters (a mismatch means
 * the matching engine should never suggest the pair), `preferences` are
 * soft signals for compatibility scoring only, never a hard exclusion.
 */
export interface Dealbreakers {
  gendersSought: Gender[];
  ageMin: number | null;
  ageMax: number | null;
  maxDistance: DistancePreference | null;
  relationshipIntentionsAccepted: RelationshipIntention[];
  smokingAccepted: FrequencyLevel[];
  partnerHasChildrenOk: boolean | null;
  partnerHasYoungChildrenOk: boolean | null;
  partnerWantsFutureChildren: FutureChildrenPreference | null;
}

export interface Preferences {
  heightMinCm: number | null;
  heightMaxCm: number | null;
  drinkingAccepted: FrequencyLevel[];
  activityLevelsPreferred: ActivityLevel[];
}

export const emptyDealbreakers: Dealbreakers = {
  gendersSought: [],
  ageMin: null,
  ageMax: null,
  maxDistance: null,
  relationshipIntentionsAccepted: [],
  smokingAccepted: [],
  partnerHasChildrenOk: null,
  partnerHasYoungChildrenOk: null,
  partnerWantsFutureChildren: null,
};

export const emptyPreferences: Preferences = {
  heightMinCm: null,
  heightMaxCm: null,
  drinkingAccepted: [],
  activityLevelsPreferred: [],
};

/**
 * "Tu presentación" — a handful of short prompts, used only as factual
 * grounding for an AI-generated introduction the person then reviews,
 * edits, and explicitly approves. `generatedText` is written server-side
 * (by the generation endpoint, from Firestore data only); `approvedText`
 * is what the person actually approved, and may differ from
 * `generatedText` if they edited it before approving.
 */
export interface PresentationPrompts {
  freeTime: string;
  values: string;
  aboutYou: string;
}

export type PresentationStatus = "not_started" | "draft" | "approved";

export interface PresentationDocument {
  prompts: PresentationPrompts;
  generatedText: string | null;
  approvedText: string | null;
  status: PresentationStatus;
}

export const emptyPresentation: PresentationDocument = {
  prompts: { freeTime: "", values: "", aboutYou: "" },
  generatedText: null,
  approvedText: null,
  status: "not_started",
};

/**
 * "About me" — Step 1 of the Junto Select Introduction profile.
 *
 * Split into `visible` (would be shown to a matched candidate, once
 * matching exists) and `private` (matching-only, never displayed to
 * another member) from day one, so later stages don't need a schema
 * migration to introduce that distinction.
 */
export interface AboutMeVisible {
  firstName: string;
  gender: Gender | null;
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
}

export interface AboutMePrivate {
  birthDate: Timestamp | null;
  incomeRange: IncomeRange | null;
}

export type ProfileStatus = "draft" | "active_for_matching";

export interface ProfileDocument {
  visible: AboutMeVisible;
  private: AboutMePrivate;
  photos: string[];
  dealbreakers: Dealbreakers;
  preferences: Preferences;
  presentation: PresentationDocument;
  meta: {
    onboardingStepIndex: number;
    aboutMeComplete: boolean;
    photosComplete: boolean;
    preferencesComplete: boolean;
    presentationComplete: boolean;
    profileStatus: ProfileStatus;
    // True only once the person has explicitly pressed "Guardar y
    // finalizar" on the Review screen — never inferred merely from every
    // section having data. This is what distinguishes "eligible" from
    // "actually reviewed and confirmed" in Profile Home's messaging.
    onboardingFinalized: boolean;
    createdAt: unknown;
    updatedAt: unknown;
  };
}

export const emptyAboutMeVisible: AboutMeVisible = {
  firstName: "",
  gender: null,
  city: "",
  profession: "",
  educationLevel: null,
  heightCm: null,
  languages: [],
  hasChildren: null,
  childrenCount: null,
  relationshipIntention: null,
  smoking: null,
  drinking: null,
  activityLevel: null,
};

export const emptyAboutMePrivate: AboutMePrivate = {
  birthDate: null,
  incomeRange: null,
};
