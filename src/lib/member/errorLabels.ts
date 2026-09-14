/**
 * Error codes returned by the /api/member/{proposals,invitations}/[id]/decide
 * routes — shown to the member instead of the raw code so a "duplicate
 * click after refresh" or "already decided the opposite way" never reads
 * as a crash. Mirrors the same intent as
 * src/lib/admin/labels.ts's manualSuggestionErrorLabel for the admin side.
 */
const MEMBER_DECISION_ERROR_LABELS: Record<string, string> = {
  not_found: "Esta propuesta ya no está disponible.",
  not_your_proposal: "No tienes permiso para responder a esta propuesta.",
  cannot_decide: "Ya habías respondido a esta propuesta con una decisión distinta.",
  // Deliberately generic — never names which field or whose dealbreaker
  // changed; see stillReciprocallyCompatible in pairHistory.ts.
  no_longer_compatible: "Esta selección ya no está disponible porque la compatibilidad del perfil ha cambiado.",
  invalid_request: "No se ha podido procesar tu respuesta.",
  invalid_json: "No se ha podido procesar tu respuesta.",
  not_signed_in: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
  unauthenticated: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
};

export function memberDecisionErrorLabel(code: string): string {
  return MEMBER_DECISION_ERROR_LABELS[code] ?? "No se ha podido procesar tu respuesta. Inténtalo de nuevo.";
}
