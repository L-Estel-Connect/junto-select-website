"use client";

import type { PublicProfileView } from "@/lib/introduction/publicProfile";
import {
  ACTIVITY_LABELS,
  DRINKING_LABELS,
  EDUCATION_LABELS,
  LANGUAGE_LABELS,
  RELATIONSHIP_LABELS,
  SMOKING_LABELS,
  childrenLine,
} from "@/lib/introduction/profileLabels";
import PublicPhotoThumbnail from "./PublicPhotoThumbnail";

/**
 * Renders ANOTHER member's profile — the proposal/invitation/introduction
 * counterpart to ProfileCard.tsx (which renders the signed-in member's
 * OWN profile from a full ProfileDocument). Deliberately takes a
 * `PublicProfileView`, not a `ProfileDocument`: that type only carries
 * fields already safe to show a curious member (see publicProfile.ts's
 * doc comment) — there is no `dealbreakers`/`preferences`/`meta` to
 * accidentally read here even by mistake, unlike ProfileCard which must
 * discipline itself to only read `visible`. Same visual language as
 * ProfileCard (same labels, same layout) so a member sees a consistent
 * "this is what a profile looks like" whether it's their own or someone
 * else's.
 */
export default function PublicProfileCard({ profile }: { profile: PublicProfileView }) {
  const languages = profile.languages
    .map((code) => LANGUAGE_LABELS[code] ?? null)
    .filter((label): label is string => Boolean(label));

  const facts: string[] = [
    profile.educationLevel && EDUCATION_LABELS[profile.educationLevel]
      ? (EDUCATION_LABELS[profile.educationLevel] as string)
      : null,
    profile.heightCm ? `${profile.heightCm} cm` : null,
    languages.length > 0 ? languages.join(", ") : null,
    childrenLine(profile.hasChildren, profile.childrenCount),
    profile.relationshipIntention ? RELATIONSHIP_LABELS[profile.relationshipIntention] : null,
    profile.smoking ? SMOKING_LABELS[profile.smoking] : null,
    profile.drinking ? DRINKING_LABELS[profile.drinking] : null,
    profile.activityLevel ? ACTIVITY_LABELS[profile.activityLevel] : null,
  ].filter((fact): fact is string => Boolean(fact));

  const [primaryPhoto, ...otherPhotos] = profile.photos;

  return (
    <div className="rounded-md border border-hairline bg-paper px-6 py-8 sm:px-10 sm:py-10">
      {primaryPhoto && (
        <div className="mx-auto max-w-[280px]">
          <PublicPhotoThumbnail key={primaryPhoto} path={primaryPhoto} primary />
        </div>
      )}

      {otherPhotos.length > 0 && (
        <div className="mx-auto mt-3 flex max-w-[280px] gap-2">
          {otherPhotos.map((path) => (
            <div key={path} className="w-1/3">
              <PublicPhotoThumbnail key={path} path={path} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 text-center">
        <h2 className="font-serif text-[26px] font-normal leading-snug text-ink">
          {profile.firstName}
          {profile.age ? `, ${profile.age}` : ""}
        </h2>
        <p className="mt-1 text-[15px] text-ink-soft">
          {[profile.city, profile.profession].filter(Boolean).join(" · ")}
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

      {profile.presentationText && (
        <div className="mx-auto mt-8 max-w-[440px] border-t border-hairline pt-6">
          <p className="text-center text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">
            Sobre {profile.firstName || "esta persona"}
          </p>
          <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink">{profile.presentationText}</p>
        </div>
      )}
    </div>
  );
}
