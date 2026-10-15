// Pure tests for the private matchmaking V1 (no emulator needed):
//   npx tsx --conditions=react-server scripts/local-test/matchmaking.test.mts
// City resolution, the 20 km "misma ciudad" rule, clients compared through the
// existing hard filters and score, client validation and programme dates.
import { distanceKm, getPlace, resolveCity, SAME_CITY_RADIUS_KM } from "../../src/lib/geo/places";
import { evaluateHardFiltersDetailed, passesHardFilters } from "../../src/lib/matching/hardFilters";
import { scorePair } from "../../src/lib/matching/scoring";
import { withProfileDefaults, type ProfileDocument } from "../../src/lib/introduction/types";
import { birthDateForAge, clientAsProfile } from "../../src/lib/clients/matchProfile";
import { ClientValidationError, programmeEndFor, sanitizeClientPatch } from "../../src/lib/clients/validate";
import { emptyClientProfile, missingForSearch, type ClientView } from "../../src/lib/clients/types";
import { AUTOMATIC_INTRODUCTIONS_ENABLED } from "../../src/lib/matching/automaticIntroductions";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

function resolvedName(text: string, nearMadrid = false): string {
  const r = resolveCity(text, { nearMadrid });
  return r.status === "resolved" ? r.place.name : r.status;
}

// --- Cities -----------------------------------------------------------------
check("Madrid", resolvedName("Madrid") === "Madrid");
check("accents and case: 'CÁCERES'", resolvedName("CÁCERES") === "Cáceres");
check("alias: Pozuelo → Pozuelo de Alarcón", resolvedName("Pozuelo") === "Pozuelo de Alarcón");
check("alias: Las Rozas", resolvedName("las rozas") === "Las Rozas de Madrid");
check("alias: Valencia → València", resolvedName("Valencia") === "València");
check("alias: Alicante → Alacant (official name)", resolvedName("Alicante") === "Alacant");
check("with province: 'Majadahonda, Madrid'", resolvedName("Majadahonda, Madrid") === "Majadahonda");
check("ambiguous: Villanueva", resolveCity("Villanueva").status === "ambiguous");
const vb = resolveCity("Villanueva (Badajoz)");
check(
  "province hint narrows the options",
  vb.status === "ambiguous" && vb.options.every((o) => o.province === "Badajoz"),
  vb.status,
);
check("unknown text", resolveCity("Xyzzy").status === "unknown");
check("empty", resolveCity("  ").status === "empty");

const madrid = getPlace("28079")!;
const pozuelo = getPlace("28115")!;
const alcala = getPlace("28005")!;
const toledo = getPlace("45168")!;
check("Madrid–Pozuelo within 20 km", distanceKm(madrid, pozuelo) <= SAME_CITY_RADIUS_KM, `${distanceKm(madrid, pozuelo).toFixed(1)} km`);
check("Madrid–Alcalá beyond 20 km", distanceKm(madrid, alcala) > SAME_CITY_RADIUS_KM, `${distanceKm(madrid, alcala).toFixed(1)} km`);
check("Madrid–Toledo ~67 km", Math.abs(distanceKm(madrid, toledo) - 67) < 8, `${distanceKm(madrid, toledo).toFixed(1)} km`);

// --- Profiles -----------------------------------------------------------------
function candidate(uid: string, city: string, over: Partial<ProfileDocument["visible"]> = {}, maxDistance: "misma_ciudad" | "sin_limite" = "sin_limite"): ProfileDocument {
  return withProfileDefaults(uid, {
    visible: {
      firstName: uid, gender: "mujer", city, profession: "Arquitecta", educationLevel: "universidad",
      languages: ["espanol"], hasChildren: false, hasYoungChildren: false, wantsFutureChildren: "no",
      relationshipIntention: "relacion_seria", smoking: "no", drinking: "socialmente", activityLevel: "activo",
      market: "madrid", marketAvailability: "lives_in_market", ...over,
    } as ProfileDocument["visible"],
    private: { birthDate: { toDate: () => new Date("1975-03-01T00:00:00Z") }, incomeRange: null } as unknown as ProfileDocument["private"],
    dealbreakers: {
      gendersSought: ["hombre"], ageMin: 45, ageMax: 62, maxDistance,
      relationshipIntentionsAccepted: ["relacion_seria"], smokingAccepted: ["no", "socialmente"], partnerYoungChildrenMatters: false,
    } as ProfileDocument["dealbreakers"],
  });
}

function client(over: Partial<ClientView> = {}, maxDistance: "misma_ciudad" | "sin_limite" = "misma_ciudad"): ClientView {
  const profile = emptyClientProfile();
  profile.visible = {
    ...profile.visible, gender: "hombre", profession: "Abogado", educationLevel: "universidad", languages: ["espanol", "ingles"],
    hasChildren: true, hasYoungChildren: false, wantsFutureChildren: "no", relationshipIntention: "relacion_seria",
    smoking: "no", drinking: "socialmente", activityLevel: "activo",
  };
  profile.dealbreakers = {
    ...profile.dealbreakers, gendersSought: ["mujer"], ageMin: 42, ageMax: 58, maxDistance,
    relationshipIntentionsAccepted: ["relacion_seria"], smokingAccepted: ["no"], partnerYoungChildrenMatters: false,
  };
  return {
    id: "c1", firstName: "Carlos", lastName: "Prueba", email: "", phone: "", channel: null,
    ageYears: 52, ageRecordedOn: "2026-10-15", city: "Madrid", placeIne: "28079", programme: "select", status: "activo",
    programmeStart: "2026-10-15", programmeEnd: "2027-04-14",
    payment: { status: "pagado", amountEur: 1950, method: null, reference: "", paidOn: null },
    profile, valuesInterests: "", dealbreakersNotes: "", notes: "", inquiryId: null,
    createdAt: null, updatedAt: null, createdBy: "admin@example.com", ...over,
  };
}

const me = clientAsProfile(client(), new Date("2026-10-15T12:00:00Z"));
check("birth date for age 52 on 15 Oct 2026 is mid-April 1974", birthDateForAge(52, "2026-10-15").toISOString().slice(0, 10) === "1974-04-16");
check("client complete → nothing missing", missingForSearch(client()).length === 0);
check("client without gender sought → missing", missingForSearch(client({ profile: { ...client().profile, dealbreakers: { ...client().profile.dealbreakers, gendersSought: [] } } })).includes("a quién busca"));

const inPozuelo = candidate("Pozuelo", "Pozuelo");
const inAlcala = candidate("Alcala", "Alcalá de Henares");
const inValencia = candidate("Valencia", "Valencia");
const typo = candidate("Typo", "Madird");
check("misma ciudad: Madrid client ↔ Pozuelo candidate passes (≤20 km)", passesHardFilters(me, inPozuelo));
check("misma ciudad: Madrid client ↔ Alcalá candidate fails (>20 km)", evaluateHardFiltersDetailed(me, inAlcala).some((f) => f.reason === "distance" && f.direction === "a_rejects_b"));
const meAnywhere = clientAsProfile(client({}, "sin_limite"));
check("sin límite: Valencia candidate passes", passesHardFilters(meAnywhere, inValencia));
const strictCandidate = candidate("Strict", "Valencia", {}, "misma_ciudad");
check(
  "reciprocal: candidate's own 20 km rule rejects a Madrid client",
  evaluateHardFiltersDetailed(meAnywhere, strictCandidate).some((f) => f.reason === "distance" && f.direction === "b_rejects_a"),
);
check("unresolvable city falls back to exact text (no match)", !passesHardFilters(me, typo));
check("same text city still matches when unresolvable on both sides", passesHardFilters(
  clientAsProfile(client({ city: "Madird", placeIne: null })), typo,
));
check("gender filter applies", !passesHardFilters(me, candidate("Man", "Madrid", { gender: "hombre" })));
check("age filter applies (candidate 51 within 42–58)", passesHardFilters(me, candidate("Ana", "Madrid")));

const s1 = scorePair(me, inPozuelo);
check("score is 0–100", s1.score >= 0 && s1.score <= 100, String(s1.score));
const worse = scorePair(me, candidate("Diff", "Madrid", { activityLevel: "poco_activo", drinking: "habitualmente", educationLevel: "formacion_profesional" }));
check("closer lifestyle scores higher", s1.score > worse.score, `${s1.score} vs ${worse.score}`);

// --- Validation -----------------------------------------------------------------
const today = "2026-10-15";
check("valid patch passes", Object.keys(sanitizeClientPatch({ firstName: " Ana ", ageYears: 47 }, today)).length === 3);
check("age sets the recorded date", sanitizeClientPatch({ ageYears: 47 }, today).ageRecordedOn === today);
function throwsField(body: Record<string, unknown>, field: string): boolean {
  try {
    sanitizeClientPatch(body, today);
    return false;
  } catch (e) {
    return e instanceof ClientValidationError && e.field === field;
  }
}
check("rejects an option the questionnaire doesn't have", throwsField({ profile: { visible: { smoking: "a_veces" } } }, "smoking"));
check("rejects two genders sought", throwsField({ profile: { dealbreakers: { gendersSought: ["mujer", "hombre"] } } }, "gendersSought"));
check("rejects 'hasta_50km' (not offered)", throwsField({ profile: { dealbreakers: { maxDistance: "hasta_50km" } } }, "maxDistance"));
check("rejects an inverted age range", throwsField({ profile: { dealbreakers: { ageMin: 60, ageMax: 40 } } }, "ageRange"));
check("rejects an unknown municipality code", throwsField({ placeIne: "99999" }, "placeIne"));
check("rejects a bad email", throwsField({ email: "no-es-email" }, "email"));
check("ignores unknown keys", Object.keys(sanitizeClientPatch({ isAdmin: true }, today)).length === 0);
check("programme end: 15 Oct + 6 months − 1 day", programmeEndFor("2026-10-15", 6) === "2027-04-14");

// --- Automatic introductions ---------------------------------------------------------
check("automatic introductions are off by default", AUTOMATIC_INTRODUCTIONS_ENABLED === false);

console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
process.exit(failed ? 1 : 0);
