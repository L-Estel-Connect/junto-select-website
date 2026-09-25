"use client";

import { useState, type ChangeEvent } from "react";
import { useAuth } from "@/lib/firebase/useAuth";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import { uploadPhoto } from "@/lib/introduction/photos";
import { UnsupportedImageError } from "@/lib/introduction/imageProcessing";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { primaryButtonClasses } from "@/lib/styles";
import type { ContactMethod } from "@/lib/introduction/types";

const METHOD_OPTIONS: { value: ContactMethod; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telefono", label: "Teléfono" },
  { value: "email", label: "Email" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
];

const inputClasses =
  "w-full rounded-md border border-hairline bg-paper px-4 py-3 text-[15px] text-ink placeholder:text-ink-soft/80 transition-colors focus:border-rose-dark focus:outline-none";

const chipClasses = (checked: boolean) =>
  `rounded-full border px-5 py-3 text-[15px] transition-colors ${
    checked ? "border-rose-dark bg-rose-tint text-ink" : "border-hairline text-ink hover:border-rose"
  }`;

/**
 * The V1 activation minimum: first name, one photo, a contact method, and
 * explicit consent — with everything the profile already has (an existing
 * complete member like Lara) pre-filled and skipped, so her activation is
 * close to one click. `useSharedProfile` is what guarantees the profile
 * document actually exists before `uploadPhoto` is ever called — the same
 * bootstrap every /introduction page relies on (see getOrCreateProfile),
 * which matters here specifically because a brand-new Reconnect
 * participant (never onboarded) has no profile document yet at all.
 */
export default function ReconnectActivationForm({
  uid,
  eventId,
  onActivated,
}: {
  uid: string;
  eventId: string;
  onActivated: () => void;
}) {
  const { user } = useAuth();
  const { profile, error: profileError, refresh: refreshProfile, mutate } = useSharedProfile(uid);
  const [firstName, setFirstName] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [contactMethod, setContactMethod] = useState<ContactMethod | null>(null);
  const [contactValue, setContactValue] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!profile) {
    if (profileError) {
      return <IntroductionError message={profileError} onRetry={() => void refreshProfile()} />;
    }
    return <IntroductionLoading />;
  }

  const hasFirstName = Boolean(profile.visible.firstName);
  const hasPhoto = profile.photos.length > 0;
  const hasContactMethod = Boolean(profile.contactPreferences.preferredMethod);
  const needsPhoneValue = contactMethod === "whatsapp" || contactMethod === "telefono";
  const needsInstagramValue = contactMethod === "instagram";
  const needsLinkedinValue = contactMethod === "linkedin";
  const needsContactValue = needsPhoneValue || needsInstagramValue || needsLinkedinValue;

  const canSubmit =
    (hasFirstName || firstName.trim().length > 0) &&
    (hasPhoto || Boolean(photoPath)) &&
    (hasContactMethod || (Boolean(contactMethod) && (!needsContactValue || contactValue.trim().length > 0))) &&
    consent &&
    !submitting &&
    !photoUploading;

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !profile) return;
    setPhotoError(null);
    setPhotoUploading(true);
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreview(previewUrl);
    try {
      const path = await uploadPhoto(uid, file, profile);
      mutate((prev) => ({ ...prev, photos: [...prev.photos, path] }));
      setPhotoPath(path);
    } catch (err) {
      setPhotoPreview(null);
      setPhotoError(
        err instanceof UnsupportedImageError ? err.message : "No hemos podido subir la foto. Inténtalo de nuevo.",
      );
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await memberFetchJson("/api/member/reconnect/activate", {
        method: "POST",
        body: JSON.stringify({
          eventId,
          firstName: firstName.trim() || null,
          photoPath,
          birthDateISO: null,
          contactMethod,
          contactValue: contactValue.trim() || null,
        }),
      });
      onActivated();
    } catch {
      setSubmitError("No hemos podido activar tu perfil de Reconnect. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
          Activa tu Reconnect
        </h1>
        <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
          Solo se te mostrará a otras personas de este evento que también
          decidan activarse. Nadie ve tu perfil hasta que lo actives.
        </p>
        {user?.email && (
          <p className="mt-3 text-[13px] text-ink-soft">
            Hemos encontrado tu entrada para este evento con el email <strong>{user.email}</strong>.
          </p>
        )}
      </div>

      {!hasFirstName && (
        <div>
          <label className="text-[15px] text-ink">Tu nombre</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Nombre"
            className={`mt-2 ${inputClasses}`}
          />
        </div>
      )}

      {!hasPhoto && (
        <div>
          <label className="text-[15px] text-ink">Una foto</label>
          <div className="mt-2 flex items-center gap-4">
            {photoPreview ? (
              <div className="relative h-24 w-20 overflow-hidden rounded-md bg-hairline/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="" className="h-full w-full object-cover" />
              </div>
            ) : (
              <label
                className={`flex h-24 w-20 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-hairline text-center text-[12px] text-ink-soft hover:border-rose ${
                  photoUploading ? "pointer-events-none opacity-50" : ""
                }`}
              >
                Añadir foto
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={photoUploading}
                  onChange={handlePhotoChange}
                />
              </label>
            )}
            <p className="text-[13px] text-ink-soft">
              {photoUploading ? "Guardando foto…" : photoPath ? "Foto guardada." : "Es privada hasta que la actives."}
            </p>
          </div>
          {photoError && <p className="mt-2 text-[13px] text-[#8a3b3b]">{photoError}</p>}
        </div>
      )}

      {!hasContactMethod && (
        <div>
          <label className="text-[15px] text-ink">¿Cómo prefieres que te contacten?</label>
          <p className="mt-1 text-[13px] text-ink-soft">
            Solo se comparte si hay interés mutuo tras aceptar una conexión.
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {METHOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setContactMethod(option.value)}
                className={chipClasses(contactMethod === option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {needsContactValue && (
            <input
              type="text"
              value={contactValue}
              onChange={(e) => setContactValue(e.target.value)}
              placeholder={needsPhoneValue ? "+34 600 000 000" : needsInstagramValue ? "@tu_usuario" : "https://www.linkedin.com/in/tu-perfil"}
              className={`mt-3 ${inputClasses}`}
            />
          )}
        </div>
      )}

      <label className="flex items-start gap-3 text-[14px] text-ink">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0"
        />
        <span>
          Quiero aparecer ante otras personas activadas de este mismo evento
          durante las próximas 48 horas.
        </span>
      </label>

      {submitError && <p className="text-[13px] text-[#8a3b3b]">{submitError}</p>}

      <button type="button" disabled={!canSubmit} onClick={handleSubmit} className={`${primaryButtonClasses} w-full`}>
        {submitting ? "Activando…" : "Activar mi Reconnect"}
      </button>
    </div>
  );
}
