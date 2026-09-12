export type StepId =
  | "firstName"
  | "gender"
  | "birthDate"
  | "city"
  | "profession"
  | "educationLevel"
  | "incomeRange"
  | "heightCm"
  | "languages"
  | "children"
  | "relationshipIntention"
  | "smoking"
  | "drinking"
  | "activityLevel"
  | "childrenAges"
  | "wantsFutureChildren"
  | "marketAvailability";

export type FieldPath =
  | `visible.${string}`
  | `private.${string}`;

interface OptionConfig {
  value: string;
  label: string;
}

interface BaseStep {
  id: StepId;
  path: FieldPath;
  question: string;
  helper?: string;
  required: boolean;
  private?: boolean;
}

export interface TextStep extends BaseStep {
  type: "text";
  placeholder?: string;
  maxLength: number;
}

export interface NumberStep extends BaseStep {
  type: "number";
  placeholder?: string;
  min: number;
  max: number;
  skippableLabel: string;
}

export interface DateStep extends BaseStep {
  type: "date";
}

export interface SelectStep extends BaseStep {
  type: "select";
  options: OptionConfig[];
}

export interface ChipsStep extends BaseStep {
  type: "chips";
  options: OptionConfig[];
  maxSelect?: number;
}

export interface ChildrenStep extends BaseStep {
  type: "children";
}

/**
 * One age input per child, converted to a birth YEAR at save time (never
 * a full birth date — see README). Auto-skipped by OnboardingWizard when
 * the person answered "no children" on the ChildrenStep above, since this
 * step's own `required` doesn't drive that (there's no per-step branching
 * mechanism in the wizard) — see OnboardingWizard's dedicated effect.
 */
export interface ChildrenAgesStep extends BaseStep {
  type: "childrenAges";
}

export type AboutMeStep =
  | TextStep
  | NumberStep
  | DateStep
  | SelectStep
  | ChipsStep
  | ChildrenStep
  | ChildrenAgesStep;

/**
 * Every question here maps to something the future matching engine or the
 * profile itself will actually use — nothing is collected "because dating
 * apps usually ask this." See ASSETS.md / project notes for the reasoning
 * behind each field; the short version:
 *
 *  - firstName, gender, city, profession, educationLevel, height,
 *    languages, children, relationshipIntention, smoking, drinking,
 *    activityLevel -> shown to a matched candidate later, and/or used as a
 *    matching axis (gender, age, city/distance, children, intention,
 *    lifestyle).
 *  - birthDate, incomeRange -> matching-only, never displayed. Income is
 *    collected as a bracket, not an exact figure, specifically so it can
 *    inform lifestyle-compatibility without ever being shown to anyone.
 *  - childrenAges, wantsFutureChildren, marketAvailability -> added later
 *    (see README "Children / future children" and "Madrid-only scope")
 *    specifically so the matching engine can enforce the
 *    partnerHasYoungChildrenOk / partnerWantsFutureChildren dealbreakers
 *    reciprocally, and so V1's Madrid-only pool restriction has real data
 *    to gate on. Deliberately appended at the end of this array — see the
 *    comment just above those steps for why.
 *
 * "Sport / physical activity" and "general lifestyle / activity level"
 * from the original brief are deliberately merged into one
 * `activityLevel` question — asking both would be the same question
 * twice.
 */
export const aboutMeSteps: AboutMeStep[] = [
  {
    id: "firstName",
    path: "visible.firstName",
    type: "text",
    question: "¿Cómo te llamas?",
    helper: "Solo tu nombre — así es como te verán otros miembros.",
    placeholder: "Tu nombre",
    maxLength: 40,
    required: true,
  },
  {
    id: "gender",
    path: "visible.gender",
    type: "select",
    question: "Soy",
    required: true,
    options: [
      { value: "mujer", label: "Mujer" },
      { value: "hombre", label: "Hombre" },
    ],
  },
  {
    id: "birthDate",
    path: "private.birthDate",
    type: "date",
    question: "¿Cuál es tu fecha de nacimiento?",
    helper: "Solo mostraremos tu edad, nunca esta fecha.",
    required: true,
    private: true,
  },
  {
    id: "city",
    path: "visible.city",
    type: "text",
    question: "¿En qué ciudad vives?",
    placeholder: "Madrid",
    maxLength: 60,
    required: true,
  },
  {
    id: "profession",
    path: "visible.profession",
    type: "text",
    question: "¿A qué te dedicas?",
    helper: "Una frase breve es suficiente.",
    placeholder: "Ej. Abogada, arquitecto, empresaria…",
    maxLength: 80,
    required: true,
  },
  {
    id: "educationLevel",
    path: "visible.educationLevel",
    type: "select",
    question: "Tu formación",
    required: true,
    options: [
      { value: "formacion_profesional", label: "Formación profesional" },
      { value: "universidad", label: "Universidad" },
      { value: "master_doctorado", label: "Máster o doctorado" },
      { value: "prefiero_no_decirlo", label: "Prefiero no decirlo" },
    ],
  },
  {
    id: "incomeRange",
    path: "private.incomeRange",
    type: "select",
    question: "Tu rango de ingresos anuales",
    helper: "Es privado. Nunca se muestra a otros miembros.",
    required: true,
    private: true,
    options: [
      { value: "menos_40k", label: "Menos de 40.000 €" },
      { value: "40k_80k", label: "40.000 – 80.000 €" },
      { value: "80k_150k", label: "80.000 – 150.000 €" },
      { value: "mas_150k", label: "Más de 150.000 €" },
      { value: "prefiero_no_decirlo", label: "Prefiero no decirlo" },
    ],
  },
  {
    id: "heightCm",
    path: "visible.heightCm",
    type: "number",
    question: "Tu altura (cm)",
    placeholder: "170",
    min: 130,
    max: 220,
    required: false,
    skippableLabel: "Prefiero no decirlo",
  },
  {
    id: "languages",
    path: "visible.languages",
    type: "chips",
    question: "¿Qué idiomas hablas?",
    required: true,
    options: [
      { value: "espanol", label: "Español" },
      { value: "ingles", label: "Inglés" },
      { value: "frances", label: "Francés" },
      { value: "aleman", label: "Alemán" },
      { value: "italiano", label: "Italiano" },
      { value: "portugues", label: "Portugués" },
      { value: "otro", label: "Otro" },
    ],
  },
  {
    id: "children",
    path: "visible.hasChildren",
    type: "children",
    question: "¿Tienes hijos?",
    required: true,
  },
  {
    id: "relationshipIntention",
    path: "visible.relationshipIntention",
    type: "select",
    question: "¿Qué tipo de relación buscas?",
    required: true,
    options: [
      { value: "relacion_seria", label: "Una relación seria" },
      {
        value: "matrimonio_familia",
        label: "Matrimonio o formar una familia",
      },
      { value: "aun_no_lo_tengo_claro", label: "Aún no lo tengo claro" },
    ],
  },
  {
    id: "smoking",
    path: "visible.smoking",
    type: "select",
    question: "¿Fumas?",
    required: true,
    options: [
      { value: "no", label: "No" },
      { value: "socialmente", label: "Socialmente" },
      { value: "habitualmente", label: "Habitualmente" },
    ],
  },
  {
    id: "drinking",
    path: "visible.drinking",
    type: "select",
    question: "¿Bebes alcohol?",
    required: true,
    options: [
      { value: "no", label: "No" },
      { value: "socialmente", label: "Socialmente" },
      { value: "habitualmente", label: "Habitualmente" },
    ],
  },
  {
    id: "activityLevel",
    path: "visible.activityLevel",
    type: "select",
    question: "Tu nivel de actividad física",
    required: true,
    options: [
      { value: "muy_activo", label: "Muy activo/a — deporte casi a diario" },
      { value: "activo", label: "Activo/a — varias veces por semana" },
      { value: "ocasional", label: "Ocasional" },
      { value: "poco_activo", label: "Poco activo/a" },
    ],
  },
  // The four steps below were added after the original nine shipped, and
  // are deliberately APPENDED here rather than inserted next to the
  // questions they relate to (children, city). A returning profile
  // resumes the wizard at its stored `onboardingStepIndex`, which for
  // anyone who completed the original wizard already equals the OLD
  // array length — appending means that index now points exactly at the
  // first new question below, so an existing profile is naturally routed
  // to answer just what's missing, with no migration or edit-page needed.
  // Inserting these earlier would silently skip them for everyone who
  // already passed that position.
  {
    id: "childrenAges",
    path: "visible.childrenBirthYears",
    type: "childrenAges",
    question: "¿Qué edad tienen tus hijos?",
    helper:
      "Nos ayuda a encontrar mejores afinidades. Guardamos el año de nacimiento, no la fecha exacta.",
    // Not a normal required/optional question — it's skipped entirely
    // (auto-answered) when hasChildren isn't true, and mandatory when it
    // is. See OnboardingWizard's auto-skip effect.
    required: false,
  },
  {
    id: "wantsFutureChildren",
    path: "visible.wantsFutureChildren",
    type: "select",
    question: "¿Te gustaría tener hijos en el futuro?",
    required: true,
    options: [
      { value: "si", label: "Sí" },
      { value: "no", label: "No" },
      { value: "no_lo_se", label: "Aún no lo sé" },
    ],
  },
  {
    id: "marketAvailability",
    path: "visible.marketAvailability",
    type: "select",
    question: "¿Cuál es tu relación con Madrid?",
    helper: "Junto Select Introduction está disponible solo en Madrid por ahora.",
    required: true,
    options: [
      { value: "lives_in_market", label: "Vivo en Madrid" },
      { value: "lives_near_market", label: "Vivo cerca de Madrid" },
      {
        value: "frequent_visitor",
        label: "No vivo en Madrid, pero estoy allí con frecuencia",
      },
      { value: "not_regular_in_market", label: "No suelo estar en Madrid" },
    ],
  },
];
