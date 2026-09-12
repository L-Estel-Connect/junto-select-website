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
import { getOrCreateProfile } from "@/lib/introduction/profile";
import { saveDealbreakers, savePreferences } from "@/lib/introduction/preferences";
import {
  getNextOnboardingRoute,
  getPrerequisiteRedirect,
  isPreferencesComplete,
} from "@/lib/introduction/completion";
import type {
  Dealbreakers,
  Preferences,
  ProfileDocument,
} from "@/lib/introduction/types";
import { primaryButtonClasses } from "@/lib/styles";
import { IntroductionLoading } from "./RequireIntroductionAuth";

const GENDER_OPTIONS = [
  { value: "mujer", label: "Mujeres" },
  { value: "hombre", label: "Hombres" },
];

const DISTANCE_OPTIONS = [
  { value: "misma_ciudad", label: "En mi misma ciudad" },
  { value: "hasta_50km", label: "Hasta 50 km" },
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

const FUTURE_CHILDREN_OPTIONS = [
  { value: "si", label: "Sí" },
  { value: "no", label: "No" },
  { value: "indiferente", label: "Me da igual" },
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
  const [profile, setProfile] = useState<ProfileDocument | null>(null);
  const [dealbreakers, setDealbreakers] = useState<Dealbreakers | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrCreateProfile(uid).then((doc) => {
      if (cancelled) return;
      setProfile(doc);
      setDealbreakers(doc.dealbreakers);
      setPreferences(doc.preferences);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    if (!profile) return;
    const redirect = getPrerequisiteRedirect(profile, "/introduction/preferences");
    if (redirect) router.replace(redirect);
  }, [profile, router]);

  if (!profile || !dealbreakers || !preferences) {
    return <IntroductionLoading />;
  }

  if (getPrerequisiteRedirect(profile, "/introduction/preferences")) {
    return <IntroductionLoading />;
  }

  function updateDealbreakers(patch: Partial<Dealbreakers>) {
    if (!profile || !dealbreakers) return;
    const next = { ...dealbreakers, ...patch };
    setDealbreakers(next);
    void saveDealbreakers(uid, next, profile);
  }

  function updatePreferences(patch: Partial<Preferences>) {
    if (!preferences) return;
    const next = { ...preferences, ...patch };
    setPreferences(next);
    void savePreferences(uid, next);
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col px-6 py-14 sm:px-0">
      <Link href="/introduction/home" className={`text-sm ${linkClasses}`}>
        ← Volver a mi perfil
      </Link>

      <h1 className="mt-6 font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Lo que buscas
      </h1>
      <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
        Tus respuestas se guardan automáticamente. Puedes volver y cambiarlas
        cuando quieras.
      </p>

      <div className="mt-10">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">
          Imprescindible para ti
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          Esto determina a quién consideraremos para ti — nunca te
          presentaremos a alguien que no encaje aquí.
        </p>

        <div className="mt-2">
          <FieldRow question="¿A quién te gustaría conocer?">
            <MultiChipField
              options={GENDER_OPTIONS}
              value={dealbreakers.gendersSought}
              onChange={(v) =>
                updateDealbreakers({ gendersSought: v as Dealbreakers["gendersSought"] })
              }
            />
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

          <FieldRow question="¿Te importaría que ya tuviera hijos?">
            <BooleanField
              value={dealbreakers.partnerHasChildrenOk}
              onChange={(v) => updateDealbreakers({ partnerHasChildrenOk: v })}
              yesLabel="No me importaría"
              noLabel="Prefiero que no"
            />
          </FieldRow>

          <FieldRow
            question="¿Y si esos hijos fueran menores de 15 años?"
            helper="Solo se tiene en cuenta si la otra persona tiene hijos."
          >
            <BooleanField
              value={dealbreakers.partnerHasYoungChildrenOk}
              onChange={(v) =>
                updateDealbreakers({ partnerHasYoungChildrenOk: v })
              }
              yesLabel="No me importaría"
              noLabel="Prefiero que no"
            />
          </FieldRow>

          <FieldRow question="¿Debe querer tener hijos en el futuro?">
            <SingleChoiceField
              options={FUTURE_CHILDREN_OPTIONS}
              value={dealbreakers.partnerWantsFutureChildren}
              onChange={(v) =>
                updateDealbreakers({
                  partnerWantsFutureChildren:
                    v as Dealbreakers["partnerWantsFutureChildren"],
                })
              }
            />
          </FieldRow>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">
          Preferencias
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          Nos ayuda a encontrar mejores afinidades, pero nunca descarta a
          alguien por sí solo.
        </p>

        <div className="mt-2">
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

      <button
        type="button"
        disabled={!isPreferencesComplete(dealbreakers)}
        onClick={() => router.push(getNextOnboardingRoute({ ...profile, dealbreakers }))}
        className={`${primaryButtonClasses} mt-12 w-full`}
      >
        Continuar
      </button>
    </div>
  );
}
