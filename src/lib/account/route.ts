import { getNextOnboardingRoute } from "@/lib/introduction/completion";
import type { ProfileDocument, RequestedService } from "@/lib/introduction/types";

/**
 * Where "Acceder" takes a signed-in person. One rule for every kind of
 * account, so that signing in never implies an Introducciones profile:
 *
 * - finished profile (passive or Select)        → their member area
 * - Select member, profile not finished         → membership welcome (benefits
 *   work without a profile), or the last step of a Select profile
 * - profile started or a service chosen         → continue the profile
 * - nothing yet (no profile, no membership)     → null: the "Tu cuenta" page,
 *   where nothing is created until they choose
 *
 * Pure: the caller reads the profile and billing state.
 */
export function decideAccountRoute(input: {
  profile: ProfileDocument | null;
  entitled: boolean;
}): string | null {
  const { profile, entitled } = input;
  if (profile?.meta.onboardingFinalized) return "/member";
  if (entitled) {
    // A Select profile whose questionnaire is done but not yet confirmed
    // (paid on the plan step) is confirmed on the profile page.
    if (profile?.meta.requestedService === "select" && getNextOnboardingRoute(profile) === "/member/profile") {
      return "/member/profile";
    }
    return "/member/bienvenida";
  }
  if (profile && (hasStartedProfile(profile) || profile.meta.requestedService)) {
    return getNextOnboardingRoute(profile);
  }
  return null;
}

/** Whether the person has answered anything in the profile questionnaire. */
export function hasStartedProfile(profile: ProfileDocument): boolean {
  return (
    profile.meta.onboardingStepIndex > 0 ||
    profile.visible.firstName.trim().length > 0 ||
    profile.photos.length > 0
  );
}

/**
 * Where an explicit choice on "Elige tu modalidad" leads, once the profile
 * (if needed) exists. A finished passive profile choosing Select goes to the
 * plan page (the upgrade keeps the same profile); an existing member is
 * never offered a second checkout.
 */
export function routeAfterChoice(input: {
  profile: ProfileDocument;
  entitled: boolean;
  service: RequestedService;
}): string {
  const { profile, entitled, service } = input;
  if (profile.meta.onboardingFinalized) {
    return service === "select" && !entitled ? "/member/plan" : "/member";
  }
  return decideAccountRoute({ profile, entitled }) ?? getNextOnboardingRoute(profile);
}

/** `?modalidad=` values used by the public site. */
export function serviceFromParam(value: string | null): RequestedService | null {
  if (value === "pasivo") return "passive";
  if (value === "activa") return "select";
  return null;
}
