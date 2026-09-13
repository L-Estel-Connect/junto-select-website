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

const FUTURE_CHILDREN_PREFERENCE_LABELS: Record<string, string> = {
  si: "Sí",
  no: "No",
  indiferente: "Le da igual",
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
  children: "Aceptación de hijos",
  young_children: "Aceptación de hijos menores de 15",
  future_children: "Compatibilidad de hijos futuros",
};

export const PAIR_HISTORY_REASON_LABELS: Record<string, string> = {
  pending_or_invited: "Ya existe una propuesta o invitación en curso",
  cooldown: "En periodo de espera tras un 'Pasar' (6 meses)",
  blocked: "Pareja bloqueada",
  mutual: "Ya existe una introducción mutua",
};
