"use client";

import { getAge } from "@/lib/introduction/age";
import type { ProfileDocument } from "@/lib/introduction/types";
import {
  ACTIVITY_LABELS,
  DRINKING_LABELS,
  EDUCATION_LABELS,
  LANGUAGE_LABELS,
  RELATIONSHIP_LABELS,
  SMOKING_LABELS,
  childrenLine,
} from "@/lib/introduction/profileLabels";
import PrivatePhotoThumbnail from "./PrivatePhotoThumbnail";

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
    childrenLine(v.hasChildren),
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
