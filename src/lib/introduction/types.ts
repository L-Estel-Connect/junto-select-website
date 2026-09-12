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

export interface ProfileDocument {
  visible: AboutMeVisible;
  private: AboutMePrivate;
  meta: {
    onboardingStepIndex: number;
    aboutMeComplete: boolean;
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
