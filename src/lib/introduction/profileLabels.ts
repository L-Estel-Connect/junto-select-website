import type { ActivityLevel, EducationLevel, FrequencyLevel, RelationshipIntention } from "./types";

/**
 * Display labels shared by every place that renders a profile the way
 * another person would see it (ProfileCard.tsx for "Ver mi perfil",
 * PublicProfileCard.tsx for a proposal/invitation/introduction's other
 * party) — extracted so both read the identical wording rather than two
 * copies that could drift apart.
 */
export const EDUCATION_LABELS: Partial<Record<EducationLevel, string>> = {
  formacion_profesional: "Formación profesional",
  universidad: "Universidad",
  master_doctorado: "Máster o doctorado",
  // "prefiero_no_decirlo" is intentionally omitted — showing "prefiero no
  // decirlo" as a value on a profile someone else will see defeats the
  // point of that option, so that case is simply not displayed at all.
};

export const LANGUAGE_LABELS: Record<string, string> = {
  espanol: "Español",
  ingles: "Inglés",
  frances: "Francés",
  aleman: "Alemán",
  italiano: "Italiano",
  portugues: "Portugués",
  otro: "Otro",
};

export const RELATIONSHIP_LABELS: Record<RelationshipIntention, string> = {
  relacion_seria: "Busca una relación seria",
  matrimonio_familia: "Busca matrimonio o formar una familia",
  aun_no_lo_tengo_claro: "Aún no lo tiene claro",
};

export const SMOKING_LABELS: Record<FrequencyLevel, string> = {
  no: "No fuma",
  socialmente: "Fuma socialmente",
  habitualmente: "Fuma habitualmente",
};

export const DRINKING_LABELS: Record<FrequencyLevel, string> = {
  no: "No bebe alcohol",
  socialmente: "Bebe socialmente",
  habitualmente: "Bebe habitualmente",
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  muy_activo: "Muy activo/a",
  activo: "Activo/a",
  ocasional: "Ocasional",
  poco_activo: "Poco activo/a",
};

export function childrenLine(hasChildren: boolean | null, count: number | null): string | null {
  if (hasChildren === null) return null;
  if (!hasChildren) return "Sin hijos";
  if (!count) return "Tiene hijos";
  return count >= 3 ? "Tiene 3 o más hijos" : `Tiene ${count} ${count === 1 ? "hijo" : "hijos"}`;
}
