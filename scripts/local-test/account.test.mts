// Pure tests for "Acceder" routing and the modality pool rule (no emulator needed):
//   npx tsx --conditions=react-server scripts/local-test/account.test.mts
import { decideAccountRoute, routeAfterChoice, serviceFromParam } from "../../src/lib/account/route";
import { isProfileInEligiblePool, explainIneligibility } from "../../src/lib/matching/eligibility";
import { withProfileDefaults, type ProfileDocument } from "../../src/lib/introduction/types";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const blank = (meta: Partial<ProfileDocument["meta"]> = {}) => {
  const p = withProfileDefaults("u1", {});
  return { ...p, meta: { ...p.meta, ...meta } };
};

/** A profile with every questionnaire section done and marked ready for matching. */
function complete(meta: Partial<ProfileDocument["meta"]> = {}): ProfileDocument {
  const p = withProfileDefaults("u2", {
    visible: {
      firstName: "Ana", gender: "mujer", city: "Madrid", profession: "Médica", educationLevel: "universidad",
      languages: ["es"], hasChildren: false, hasYoungChildren: false, wantsFutureChildren: "no",
      relationshipIntention: "relacion_seria", smoking: "no", drinking: "socialmente", activityLevel: "activo",
      market: "madrid", marketAvailability: "lives_in_market",
    } as Partial<ProfileDocument["visible"]> as ProfileDocument["visible"],
    private: { birthDate: new Date("1978-05-20T00:00:00Z"), incomeRange: "40k_80k" } as unknown as ProfileDocument["private"],
    dealbreakers: {
      gendersSought: ["hombre"], ageMin: 45, ageMax: 60, maxDistance: "misma_ciudad",
      relationshipIntentionsAccepted: ["relacion_seria"], smokingAccepted: ["no"], partnerYoungChildrenMatters: false,
    } as Partial<ProfileDocument["dealbreakers"]> as ProfileDocument["dealbreakers"],
    photos: ["profiles/u2/a.jpg"],
    presentation: { status: "approved" } as ProfileDocument["presentation"],
  });
  return {
    ...p,
    meta: {
      ...p.meta, aboutMeComplete: true, photosComplete: true, preferencesComplete: true, presentationComplete: true,
      profileStatus: "active_for_matching", ...meta,
    },
  };
}

// Acceder
check("no profile, no membership → Tu cuenta (null)", decideAccountRoute({ profile: null, entitled: false }) === null);
check("empty profile left by an old visit → Tu cuenta", decideAccountRoute({ profile: blank(), entitled: false }) === null);
check("member without profile → welcome", decideAccountRoute({ profile: null, entitled: true }) === "/member/bienvenida");
check("member with technical draft → welcome", decideAccountRoute({ profile: blank(), entitled: true }) === "/member/bienvenida");
check("passive chosen → questionnaire", decideAccountRoute({ profile: blank({ requestedService: "passive" }), entitled: false }) === "/introduction/onboarding");
check("finished profile → member area", decideAccountRoute({ profile: complete({ onboardingFinalized: true }), entitled: false }) === "/member");
check("Select profile complete, not paid → plan step on profile",
  decideAccountRoute({ profile: complete({ requestedService: "select" }), entitled: false }) === "/member/profile");
check("Select profile complete, paid → profile (auto-confirm)",
  decideAccountRoute({ profile: complete({ requestedService: "select" }), entitled: true }) === "/member/profile");

// Choice
check("finished passive choosing Select → plan page",
  routeAfterChoice({ profile: complete({ onboardingFinalized: true }), entitled: false, service: "select" }) === "/member/plan");
check("finished member choosing Select → member area, no second checkout",
  routeAfterChoice({ profile: complete({ onboardingFinalized: true }), entitled: true, service: "select" }) === "/member");
check("new choice → questionnaire", routeAfterChoice({ profile: blank({ requestedService: "select" }), entitled: false, service: "select" }) === "/introduction/onboarding");
check("modalidad params", serviceFromParam("pasivo") === "passive" && serviceFromParam("activa") === "select" && serviceFromParam("x") === null);

// Pool: a new-journey profile is never proposed before an explicit choice is confirmed.
const awaiting = complete({ requestedService: "select" });
check("complete Select profile awaiting payment is out of the pool", !isProfileInEligiblePool(awaiting));
check("…with an explicit reason", JSON.stringify(explainIneligibility(awaiting)).includes("awaiting_service_choice"));
check("same profile once finalized is in the pool", isProfileInEligiblePool(complete({ requestedService: "select", onboardingFinalized: true })));
check("finalized passive profile is in the pool", isProfileInEligiblePool(complete({ requestedService: "passive", onboardingFinalized: true })));
check("legacy profile without a modality: rule unchanged", isProfileInEligiblePool(complete()));

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
