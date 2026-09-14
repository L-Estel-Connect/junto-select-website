import { aboutMeSteps, type StepId } from "@/lib/introduction/aboutMeFields";

/**
 * Human-readable Spanish labels for the admin dashboard, derived from the
 * SAME option lists the onboarding wizard already shows a member — so the
 * dashboard never invents a second translation that could drift from what
 * a member actually saw when answering. Only a handful of dealbreaker-only
 * values (which have no corresponding onboarding step, e.g. maxDistance)
 * are hand-written below.
 */
function labelMapFor(stepId: StepId): Record<string, string> {
  const step = aboutMeSteps.find((s) => s.id === stepId);
  if (!step || !("options" in step)) return {};
  return Object.fromEntries(step.options.map((o) => [o.value, o.label]));
}

const GENDER_LABELS = labelMapFor("gender");
const EDUCATION_LABELS = labelMapFor("educationLevel");
const RELATIONSHIP_INTENTION_LABELS = labelMapFor("relationshipIntention");
const FREQUENCY_LABELS = labelMapFor("smoking"); // smoking/drinking/smokingAccepted/drinkingAccepted all share this option set
const ACTIVITY_LABELS = labelMapFor("activityLevel");
const FUTURE_CHILDREN_INTENTION_LABELS = labelMapFor("wantsFutureChildren"); // si/no/no_lo_se — self-report
const MARKET_AVAILABILITY_LABELS = labelMapFor("marketAvailability");

const LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(
  (aboutMeSteps.find((s) => s.id === "languages") as { options: { value: string; label: string }[] })
    .options.map((o) => [o.value, o.label]),
);

// Dealbreaker-only values with no corresponding onboarding step.
const DISTANCE_LABELS: Record<string, string> = {
  misma_ciudad: "Misma ciudad",
  hasta_50km: "Hasta 50 km (no aplicado — sin datos de distancia)",
  sin_limite: "Sin límite",
};

// Explicit statements, not yes/no answers — mirrors the member-facing
// option wording in PreferencesSection.tsx exactly, so the admin view can
// never look more ambiguous than what the member actually saw and chose
// (see semantics audit: a "¿Debe...? No" framing risked being misread as
// "not required" instead of the intended "must not want children").
const FUTURE_CHILDREN_PREFERENCE_LABELS: Record<string, string> = {
  si: "Debe querer tener hijos",
  no: "No debe querer tener hijos",
  indiferente: "Me da igual",
};

function lookup(map: Record<string, string>, value: string | null): string {
  if (value === null) return "No especificado";
  return map[value] ?? value;
}

export function genderLabel(value: string | null): string {
  return lookup(GENDER_LABELS, value);
}
export function educationLabel(value: string | null): string {
  return lookup(EDUCATION_LABELS, value);
}
export function relationshipIntentionLabel(value: string | null): string {
  return lookup(RELATIONSHIP_INTENTION_LABELS, value);
}
export function frequencyLabel(value: string | null): string {
  return lookup(FREQUENCY_LABELS, value);
}
export function activityLabel(value: string | null): string {
  return lookup(ACTIVITY_LABELS, value);
}
export function marketAvailabilityLabel(value: string | null): string {
  return lookup(MARKET_AVAILABILITY_LABELS, value);
}
export function distanceLabel(value: string | null): string {
  return lookup(DISTANCE_LABELS, value);
}
export function futureChildrenIntentionLabel(value: string | null): string {
  return lookup(FUTURE_CHILDREN_INTENTION_LABELS, value);
}
export function futureChildrenPreferenceLabel(value: string | null): string {
  return lookup(FUTURE_CHILDREN_PREFERENCE_LABELS, value);
}
// Plain Sí/No/No especificado — the simplified model's only children
// question is a single boolean (partnerYoungChildrenMatters), so no
// lookup table is needed.
export function youngChildrenMattersLabel(value: boolean | null): string {
  if (value === null) return "No especificado";
  return value ? "Sí" : "No";
}
export function languageLabel(value: string): string {
  return LANGUAGE_LABELS[value] ?? value;
}
export function languageList(values: string[]): string {
  return values.length > 0 ? values.map(languageLabel).join(", ") : "No especificado";
}

export const HARD_FILTER_REASON_LABELS: Record<string, string> = {
  gender: "Género buscado",
  age: "Rango de edad",
  distance: "Distancia / ciudad",
  relationship_intention: "Tipo de relación aceptado",
  smoking: "Aceptación de fumador",
  young_children: "Hijos menores de 15",
  future_children: "Compatibilidad de hijos futuros",
};

/**
 * `evaluateHardFiltersDetailed` (hardFilters.ts) reports every failing
 * check in BOTH reciprocal directions — a person can fail the same reason
 * from either side (e.g. neither's own smoking-acceptance dealbreaker
 * includes the other's actual smoking level), which is two genuinely
 * independent, real facts, not a duplicate. `HARD_FILTER_REASON_LABELS`
 * alone can't distinguish them (same reason -> same label), which is what
 * made two real, distinct reciprocal failures look like an inexplicable
 * repeated bullet in the admin "Sugerir alguien" panel. This names WHOSE
 * requirement wasn't met by WHOM, so two same-reason entries always read
 * as the two distinct facts they are.
 */
export function hardFilterFailureLabel(
  failure: { reason: string; direction: "a_rejects_b" | "b_rejects_a" },
  recipientName: string,
  candidateName: string,
): string {
  const reasonLabel = HARD_FILTER_REASON_LABELS[failure.reason] ?? failure.reason;
  const doesNotMeet = failure.direction === "a_rejects_b" ? candidateName : recipientName;
  const requirementOf = failure.direction === "a_rejects_b" ? recipientName : candidateName;
  return `${reasonLabel}: ${doesNotMeet} no cumple el requisito de ${requirementOf}`;
}

/**
 * Error codes returned by POST .../suggest (createManualSuggestion) when a
 * server-side safety re-check fails — shown to the admin instead of the raw
 * code so they understand WHY a suggestion they previewed as sendable was
 * refused (the preview list can go stale between load and click, e.g.
 * another admin suggesting the same pair first).
 */
export const MANUAL_SUGGESTION_ERROR_LABELS: Record<string, string> = {
  recipient_not_found: "No se encuentra el perfil de la persona destinataria.",
  candidate_not_found: "No se encuentra el perfil de la persona sugerida.",
  same_person: "No se puede sugerir a la misma persona.",
  already_suggested: "Ya se sugirió esta pareja anteriormente.",
  recipient_not_eligible: "La persona destinataria ya no cumple los requisitos para el emparejamiento.",
  candidate_not_eligible: "La persona sugerida ya no cumple los requisitos para el emparejamiento.",
  hard_filter_failed: "Esta pareja ya no cumple los requisitos imprescindibles.",
  pair_not_eligible: "Esta pareja no está disponible (bloqueada, en espera o ya conectada).",
  candidateUid_required: "Falta seleccionar a quién sugerir.",
  invalid_json: "No se ha podido procesar la solicitud.",
};

export function manualSuggestionErrorLabel(code: string): string {
  return MANUAL_SUGGESTION_ERROR_LABELS[code] ?? "No se ha podido crear la sugerencia.";
}

export const PAIR_HISTORY_REASON_LABELS: Record<string, string> = {
  pending_or_invited: "Ya existe una propuesta o invitación en curso",
  cooldown: "En periodo de espera tras un 'Pasar' (6 meses)",
  blocked: "Pareja bloqueada",
  mutual: "Ya existe una introducción mutua",
};
