"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BooleanField,
  FieldRow,
  MultiChipField,
  NumberRangeField,
  SingleChoiceField,
} from "./PreferenceFields";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import { saveDealbreakers, savePreferences } from "@/lib/introduction/preferences";
import {
  getNextOnboardingRoute,
  getPrerequisiteRedirect,
  isPreferencesComplete,
} from "@/lib/introduction/completion";
import type { Dealbreakers, Preferences } from "@/lib/introduction/types";
import { primaryButtonClasses } from "@/lib/styles";
import { IntroductionError, IntroductionLoading } from "./RequireIntroductionAuth";
import { OnboardingStepper, inOnboarding } from "./OnboardingFrame";
import { preferencesMissingFields } from "@/lib/introduction/completion";

// What the "Continuar" hint names when something is still missing.
const MISSING_LABELS: Record<string, string> = {
  gendersSought: "a quién te gustaría conocer",
  gendersSoughtAmbiguous: "a quién te gustaría conocer",
  ageMin: "rango de edad",
  ageMax: "rango de edad",
  ageRange: "rango de edad",
  maxDistance: "distancia máxima",
  relationshipIntentionsAccepted: "tipo de relación",
  smokingAccepted: "tabaco",
  partnerYoungChildrenMatters: "hijos menores de 15 años",
};

const GENDER_OPTIONS = [
  { value: "mujer", label: "Mujeres" },
  { value: "hombre", label: "Hombres" },
];

// "hasta_50km" is deliberately not offered here — there's no distance
// data (no geocoding) to actually enforce it, and it would behave exactly
// like "sin_limite" while looking like a real, distinct constraint to the
// person choosing it. The value still exists in DistancePreference for
// when real distance data exists later.
const DISTANCE_OPTIONS = [
  { value: "misma_ciudad", label: "En mi misma ciudad" },
  { value: "sin_limite", label: "Sin límite" },
];

const INTENTION_OPTIONS = [
  { value: "relacion_seria", label: "Una relación seria" },
  { value: "matrimonio_familia", label: "Matrimonio o formar una familia" },
  { value: "aun_no_lo_tengo_claro", label: "Aún no lo tiene claro" },
];

const FREQUENCY_OPTIONS = [
  { value: "no", label: "No" },
  { value: "socialmente", label: "Socialmente" },
  { value: "habitualmente", label: "Habitualmente" },
];

const ACTIVITY_OPTIONS = [
  { value: "muy_activo", label: "Muy activo/a" },
  { value: "activo", label: "Activo/a" },
  { value: "ocasional", label: "Ocasional" },
  { value: "poco_activo", label: "Poco activo/a" },
];

const linkClasses =
  "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

export default function PreferencesSection({ uid }: { uid: string }) {
  const router = useRouter();
  const { profile, error: profileError, refresh: refreshProfile, mutate } = useSharedProfile(uid);
  const [dealbreakers, setDealbreakers] = useState<Dealbreakers | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  // While the profile is being completed, the two existing groups are shown
  // one after the other (same questions, same order); once confirmed, the
  // page shows both at once for editing.
  const [part, setPart] = useState<1 | 2>(1);

  // Adjusted during render (not in an effect) — initializes local state
  // from the loaded profile exactly once, then locally controlled: this
  // page autosaves on every change, so it must not be clobbered by a
  // later `mutate` from elsewhere re-deriving these from a stale `profile`
  // snapshot (the local state IS the source of truth for what's on screen
  // once editing has started). See OnboardingWizard.tsx for why this
  // pattern is safe and doesn't loop.
  if (profile && dealbreakers === null && preferences === null) {
    setDealbreakers(profile.dealbreakers);
    setPreferences(profile.preferences);
  }

  useEffect(() => {
    if (!profile) return;
    const redirect = getPrerequisiteRedirect(profile, "/member/profile/preferences");
    if (redirect) router.replace(redirect);
  }, [profile, router]);

  if (!profile) {
    if (profileError) {
      return <IntroductionError message={profileError} onRetry={() => void refreshProfile()} />;
    }
    return <IntroductionLoading />;
  }

  if (!dealbreakers || !preferences) {
    return <IntroductionLoading />;
  }

  if (getPrerequisiteRedirect(profile, "/member/profile/preferences")) {
    return <IntroductionLoading />;
  }

  const ageRangeInvalid =
    dealbreakers.ageMin !== null &&
    dealbreakers.ageMax !== null &&
    dealbreakers.ageMin > dealbreakers.ageMax;

  function updateDealbreakers(patch: Partial<Dealbreakers>) {
    if (!profile || !dealbreakers) return;
    const next = { ...dealbreakers, ...patch };
    setDealbreakers(next);
    mutate((prev) => ({ ...prev, dealbreakers: next }));
    void saveDealbreakers(uid, next, profile);
  }

  function updatePreferences(patch: Partial<Preferences>) {
    if (!preferences) return;
    const next = { ...preferences, ...patch };
    setPreferences(next);
    mutate((prev) => ({ ...prev, preferences: next }));
    void savePreferences(uid, next);
  }

  const onboarding = inOnboarding(profile);
  const showEssentials = !onboarding || part === 1;
  const showPreferences = !onboarding || part === 2;
  const missing = [...new Set(preferencesMissingFields(dealbreakers).map((f) => MISSING_LABELS[f] ?? f))];

  function goToPart(next: 1 | 2) {
    setPart(next);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col py-14">
      {onboarding ? (
        <OnboardingStepper
          stage={2}
          fraction={part / 2}
          detail={`${part} de 2`}
          selectJourney={profile.meta.requestedService === "select"}
          onBack={part === 2 ? () => goToPart(1) : undefined}
        />
      ) : (
        <Link href="/member/profile" className={`mb-6 text-sm ${linkClasses}`}>
          ← Volver a mi perfil
        </Link>
      )}

      <h1 className="font-serif text-[30px] font-normal leading-[1.15] text-ink sm:text-[40px]">
        Lo que buscas
      </h1>
      {!onboarding && (
        <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
          Tus respuestas se guardan automáticamente.
        </p>
      )}

      {showEssentials && (
      <div className="mt-10">
        <h2 className="font-serif text-[24px] font-normal leading-snug text-ink">
          Imprescindible para ti
        </h2>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
          Esto determina a quién consideraremos para ti — nunca te
          presentaremos a alguien que no encaje aquí.
        </p>

        <div className="mt-8">
          <FieldRow question="¿A quién te gustaría conocer?">
            {/* Single-selection by product design (V1: exactly one desired
                partner gender) — see completion.ts preferencesMissingFields
                and hardFilters.ts acceptsGender for the matching-side
                enforcement. `gendersSought` stays an array in Firestore for
                backward compatibility with an earlier multi-select UI, so
                this reads/writes it as a derived single value: a legacy
                profile with more than one entry shows as unselected here
                (never silently resolved to one on this person's behalf —
                see the warning below) until they explicitly choose one. */}
            <SingleChoiceField
              options={GENDER_OPTIONS}
              value={dealbreakers.gendersSought.length === 1 ? dealbreakers.gendersSought[0] : null}
              onChange={(v) => updateDealbreakers({ gendersSought: [v as Dealbreakers["gendersSought"][number]] })}
            />
            {dealbreakers.gendersSought.length > 1 && (
              <p className="mt-2 text-[13px] text-rose-dark">
                Tienes más de una opción guardada de una versión anterior. Elige una para continuar — no
                se te presentará a nadie hasta entonces.
              </p>
            )}
          </FieldRow>

          <FieldRow question="Rango de edad">
            <NumberRangeField
              min={25}
              max={90}
              minValue={dealbreakers.ageMin}
              maxValue={dealbreakers.ageMax}
              onChangeMin={(v) => updateDealbreakers({ ageMin: v })}
              onChangeMax={(v) => updateDealbreakers({ ageMax: v })}
              unit="años"
            />
            {ageRangeInvalid && (
              <p className="mt-2 text-[13px] text-rose-dark">
                El mínimo debe ser menor o igual que el máximo.
              </p>
            )}
          </FieldRow>

          <FieldRow question="Distancia máxima">
            <SingleChoiceField
              options={DISTANCE_OPTIONS}
              value={dealbreakers.maxDistance}
              onChange={(v) =>
                updateDealbreakers({
                  maxDistance: v as Dealbreakers["maxDistance"],
                })
              }
            />
          </FieldRow>

          <FieldRow question="Qué tipo de relación debe buscar la otra persona">
            <MultiChipField
              options={INTENTION_OPTIONS}
              value={dealbreakers.relationshipIntentionsAccepted}
              onChange={(v) =>
                updateDealbreakers({
                  relationshipIntentionsAccepted:
                    v as Dealbreakers["relationshipIntentionsAccepted"],
                })
              }
            />
          </FieldRow>

          <FieldRow question="¿Aceptarías a alguien que fuma?">
            <MultiChipField
              options={FREQUENCY_OPTIONS}
              value={dealbreakers.smokingAccepted}
              onChange={(v) =>
                updateDealbreakers({
                  smokingAccepted: v as Dealbreakers["smokingAccepted"],
                })
              }
            />
          </FieldRow>

          {/* Deliberately the ONLY children-related partner question — no
              general "accepts a partner with children" question at all
              (a candidate whose children are all 15+ always passes; see
              hardFilters.ts acceptsYoungChildren and types.ts
              partnerYoungChildrenMatters for the product history). */}
          <FieldRow
            question="¿Te importaría que tuviera hijos menores de 15 años?"
            helper="Solo se tiene en cuenta si la otra persona tiene hijos menores de 15 años."
          >
            <BooleanField
              value={dealbreakers.partnerYoungChildrenMatters}
              onChange={(v) => updateDealbreakers({ partnerYoungChildrenMatters: v })}
              yesLabel="Sí, me importaría"
              noLabel="No, no me importaría"
            />
          </FieldRow>
        </div>
      </div>

      )}

      {showPreferences && (
      <div className={onboarding ? "mt-10" : "mt-14"}>
        <h2 className="font-serif text-[24px] font-normal leading-snug text-ink">
          Preferencias
        </h2>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
          Nos ayuda a encontrar mejores afinidades, pero nunca descarta a
          alguien por sí solo.
        </p>

        <div className="mt-8">
          <FieldRow question="Rango de altura (opcional)">
            <NumberRangeField
              min={140}
              max={210}
              minValue={preferences.heightMinCm}
              maxValue={preferences.heightMaxCm}
              onChangeMin={(v) => updatePreferences({ heightMinCm: v })}
              onChangeMax={(v) => updatePreferences({ heightMaxCm: v })}
              unit="cm"
            />
          </FieldRow>

          <FieldRow question="¿Te importa que beba alcohol?">
            <MultiChipField
              options={FREQUENCY_OPTIONS}
              value={preferences.drinkingAccepted}
              onChange={(v) =>
                updatePreferences({
                  drinkingAccepted: v as Preferences["drinkingAccepted"],
                })
              }
            />
          </FieldRow>

          <FieldRow question="Nivel de actividad física que prefieres">
            <MultiChipField
              options={ACTIVITY_OPTIONS}
              value={preferences.activityLevelsPreferred}
              onChange={(v) =>
                updatePreferences({
                  activityLevelsPreferred:
                    v as Preferences["activityLevelsPreferred"],
                })
              }
            />
          </FieldRow>
        </div>
      </div>

      )}

      <div className="sticky bottom-0 z-10 -mx-6 mt-12 border-t border-hairline bg-paper px-6 pb-[max(env(safe-area-inset-bottom),16px)] pt-4 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <button
          type="button"
          disabled={!isPreferencesComplete(dealbreakers)}
          onClick={() =>
            onboarding && part === 1
              ? goToPart(2)
              : router.push(getNextOnboardingRoute({ ...profile, dealbreakers }))
          }
          className={`${primaryButtonClasses} w-full`}
        >
          Continuar
        </button>
        {missing.length > 0 && (
          <p className="mt-2 text-center text-[13px] text-ink-soft">Falta: {missing.join(", ")}.</p>
        )}
      </div>
    </div>
  );
}
