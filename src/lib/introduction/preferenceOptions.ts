/**
 * Option lists for "Lo que buscas", shared by the candidate questionnaire
 * (PreferencesSection.tsx) and the team's client form (/admin/clientes), so
 * a client and a candidate always answer the same question the same way.
 */

export const GENDER_OPTIONS = [
  { value: "mujer", label: "Mujeres" },
  { value: "hombre", label: "Hombres" },
];

// "En mi misma ciudad" is applied as within 20 km (hardFilters.ts,
// src/lib/geo). "hasta_50km" is still not offered: it exists in
// DistancePreference but was never asked, so no one holds it.
export const DISTANCE_OPTIONS = [
  { value: "misma_ciudad", label: "En mi misma ciudad" },
  { value: "sin_limite", label: "Sin límite" },
];

export const INTENTION_OPTIONS = [
  { value: "relacion_seria", label: "Una relación seria" },
  { value: "matrimonio_familia", label: "Matrimonio o formar una familia" },
  { value: "aun_no_lo_tengo_claro", label: "Aún no lo tiene claro" },
];

export const FREQUENCY_OPTIONS = [
  { value: "no", label: "No" },
  { value: "socialmente", label: "Socialmente" },
  { value: "habitualmente", label: "Habitualmente" },
];

export const ACTIVITY_OPTIONS = [
  { value: "muy_activo", label: "Muy activo/a" },
  { value: "activo", label: "Activo/a" },
  { value: "ocasional", label: "Ocasional" },
  { value: "poco_activo", label: "Poco activo/a" },
];
