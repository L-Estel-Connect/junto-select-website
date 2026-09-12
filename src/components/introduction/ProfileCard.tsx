"use client";

import { getAge } from "@/lib/introduction/age";
import type {
  ActivityLevel,
  EducationLevel,
  FrequencyLevel,
  ProfileDocument,
  RelationshipIntention,
} from "@/lib/introduction/types";
import PrivatePhotoThumbnail from "./PrivatePhotoThumbnail";

const EDUCATION_LABELS: Partial<Record<EducationLevel, string>> = {
  formacion_profesional: "Formación profesional",
  universidad: "Universidad",
  master_doctorado: "Máster o doctorado",
  // "prefiero_no_decirlo" is intentionally omitted — showing "prefiero no
  // decirlo" as a value on a profile someone else will see defeats the
  // point of that option, so that case is simply not displayed at all.
};

const LANGUAGE_LABELS: Record<string, string> = {
  espanol: "Español",
  ingles: "Inglés",
  frances: "Francés",
  aleman: "Alemán",
  italiano: "Italiano",
  portugues: "Portugués",
  otro: "Otro",
};

const RELATIONSHIP_LABELS: Record<RelationshipIntention, string> = {
  relacion_seria: "Busca una relación seria",
  matrimonio_familia: "Busca matrimonio o formar una familia",
  aun_no_lo_tengo_claro: "Aún no lo tiene claro",
};

const SMOKING_LABELS: Record<FrequencyLevel, string> = {
  no: "No fuma",
  socialmente: "Fuma socialmente",
  habitualmente: "Fuma habitualmente",
};

const DRINKING_LABELS: Record<FrequencyLevel, string> = {
  no: "No bebe alcohol",
  socialmente: "Bebe socialmente",
  habitualmente: "Bebe habitualmente",
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  muy_activo: "Muy activo/a",
  activo: "Activo/a",
  ocasional: "Ocasional",
  poco_activo: "Poco activo/a",
};

function childrenLine(hasChildren: boolean | null, count: number | null): string | null {
  if (hasChildren === null) return null;
  if (!hasChildren) return "Sin hijos";
  if (!count) return "Tiene hijos";
  return count >= 3 ? "Tiene 3 o más hijos" : `Tiene ${count} ${count === 1 ? "hijo" : "hijos"}`;
}

/**
 * Renders a profile the way another selected member would eventually see
 * it — reads only `profile.visible`, `profile.photos`, and the approved
 * presentation text. Never reads `profile.private` for display (only to
 * derive age from the birth date, which itself is never rendered) and
 * never reads `profile.dealbreakers` / `profile.preferences` at all —
 * those are matching-only and must never appear here. Used both by the
 * pre-finalize Review screen and by "Ver mi perfil" afterward.
 */
export default function ProfileCard({ profile }: { profile: ProfileDocument }) {
  const v = profile.visible;
  const age = profile.private.birthDate
    ? getAge(profile.private.birthDate.toDate().toISOString().slice(0, 10))
    : null;

  const languages = v.languages
    .map((code) => LANGUAGE_LABELS[code] ?? null)
    .filter((label): label is string => Boolean(label));

  const facts: string[] = [
    v.educationLevel && EDUCATION_LABELS[v.educationLevel]
      ? (EDUCATION_LABELS[v.educationLevel] as string)
      : null,
    v.heightCm ? `${v.heightCm} cm` : null,
    languages.length > 0 ? languages.join(", ") : null,
    childrenLine(v.hasChildren, v.childrenCount),
    v.relationshipIntention ? RELATIONSHIP_LABELS[v.relationshipIntention] : null,
    v.smoking ? SMOKING_LABELS[v.smoking] : null,
    v.drinking ? DRINKING_LABELS[v.drinking] : null,
    v.activityLevel ? ACTIVITY_LABELS[v.activityLevel] : null,
  ].filter((fact): fact is string => Boolean(fact));

  const [primaryPhoto, ...otherPhotos] = profile.photos;

  return (
    <div className="rounded-md border border-hairline bg-paper px-6 py-8 sm:px-10 sm:py-10">
      {primaryPhoto && (
        <div className="mx-auto max-w-[280px]">
          <PrivatePhotoThumbnail path={primaryPhoto} primary />
        </div>
      )}

      {otherPhotos.length > 0 && (
        <div className="mx-auto mt-3 flex max-w-[280px] gap-2">
          {otherPhotos.map((path) => (
            <div key={path} className="w-1/3">
              <PrivatePhotoThumbnail path={path} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 text-center">
        <h2 className="font-serif text-[26px] font-normal leading-snug text-ink">
          {v.firstName}
          {age ? `, ${age}` : ""}
        </h2>
        <p className="mt-1 text-[15px] text-ink-soft">
          {[v.city, v.profession].filter(Boolean).join(" · ")}
        </p>
      </div>

      {facts.length > 0 && (
        <div className="mx-auto mt-8 max-w-[360px] border-t border-hairline pt-6">
          <ul className="space-y-2 text-center text-[14px] leading-relaxed text-ink-soft">
            {facts.map((fact, index) => (
              <li key={index}>{fact}</li>
            ))}
          </ul>
        </div>
      )}

      {profile.presentation.approvedText && (
        <div className="mx-auto mt-8 max-w-[440px] border-t border-hairline pt-6">
          <p className="text-center text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">
            Sobre {v.firstName || "esta persona"}
          </p>
          <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink">
            {profile.presentation.approvedText}
          </p>
        </div>
      )}
    </div>
  );
}
