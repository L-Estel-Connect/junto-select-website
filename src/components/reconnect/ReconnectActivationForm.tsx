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

const secondaryButtonClasses =
  "rounded-full border border-hairline px-6 py-3 text-[13px] text-ink transition-colors hover:border-rose disabled:cursor-not-allowed disabled:opacity-60";

type Mode = "choice" | "activate" | "opt-out-confirm";

/**
 * The activation landing screen — presents the two choices the product spec
 * requires ("Activar Reconnect" / "No quiero participar") before showing
 * either sub-flow. `mode` is purely local UI state; nothing is written
 * until the person actually submits one of the two sub-forms below.
 */
export default function ReconnectActivationForm({
  uid,
  eventId,
  onActivated,
  onOptedOut,
}: {
  uid: string;
  eventId: string;
  onActivated: () => void;
  onOptedOut: () => void;
}) {
  const [mode, setMode] = useState<Mode>("choice");

  if (mode === "choice") {
    return (
      <div className="flex min-h-[50svh] flex-col items-center justify-center gap-6 px-6 text-center">
        <div>
          <h1 className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
            Reconnect está disponible para este evento
          </h1>
          <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
            Puedes activar tu perfil para volver a ver a quien conociste, o decidir no participar.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <button type="button" onClick={() => setMode("activate")} className={`${primaryButtonClasses} w-full`}>
            Activar Reconnect
          </button>
          <button type="button" onClick={() => setMode("opt-out-confirm")} className="text-[13px] text-ink-soft underline">
            No quiero participar
          </button>
        </div>
      </div>
    );
  }

  if (mode === "opt-out-confirm") {
    return (
      <ReconnectOptOutConfirm eventId={eventId} onBack={() => setMode("choice")} onOptedOut={onOptedOut} />
    );
  }

  return <ReconnectActivateSubForm uid={uid} eventId={eventId} onActivated={onActivated} onBack={() => setMode("choice")} />;
}

function ReconnectOptOutConfirm({
  eventId,
  onBack,
  onOptedOut,
}: {
  eventId: string;
  onBack: () => void;
  onOptedOut: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      await memberFetchJson(`/api/member/reconnect/${eventId}/opt-out`, { method: "POST" });
      onOptedOut();
    } catch {
      setError("No hemos podido registrar tu decisión. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[50svh] flex-col items-center justify-center gap-5 px-6 text-center">
      <div>
        <h1 className="font-serif text-[24px] font-normal leading-snug text-ink">No participar en Reconnect</h1>
        <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
          Puedes solicitar la eliminación de tus datos de Reconnect para este evento. No aparecerás en la búsqueda
          ni en la galería, y no recibirás más solicitudes ni correos sobre este evento.
        </p>
        <p className="mt-3 max-w-[46ch] text-[13px] leading-relaxed text-ink-soft">
          Esto no afecta a tu cuenta ni a tu perfil de Junto Select — solo a tu participación en Reconnect para
          este evento.
        </p>
      </div>

      {!confirming ? (
        <div className="flex flex-col items-center gap-3">
          <button type="button" onClick={() => setConfirming(true)} className={secondaryButtonClasses}>
            No quiero participar y quiero eliminar mis datos de Reconnect
          </button>
          <button type="button" onClick={onBack} className="text-[13px] text-ink-soft underline">
            Volver
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <p className="text-[13px] text-ink-soft">Esta acción no se puede deshacer. ¿Confirmas?</p>
          <div className="flex gap-3">
            <button type="button" disabled={submitting} onClick={handleConfirm} className={primaryButtonClasses}>
              {submitting ? "Eliminando…" : "Sí, eliminar mis datos"}
            </button>
            <button type="button" disabled={submitting} onClick={() => setConfirming(false)} className={secondaryButtonClasses}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-[13px] text-[#8a3b3b]">{error}</p>}
    </div>
  );
}

/**
 * The V1 activation minimum: first name, a contact method, and explicit
 * consent — with everything the profile already has (an existing complete
 * member like Lara) pre-filled and skipped, so her activation is close to
 * one click. A photo is deliberately NEVER required (see the product spec):
 * if the profile already has one, the person is asked whether they want it
 * shown in Reconnect for this event; if not, they may optionally upload
 * one, but nothing here blocks submission either way.
 *
 * `useSharedProfile` is what guarantees the profile document actually
 * exists before `uploadPhoto` is ever called — the same bootstrap every
 * /introduction page relies on (see getOrCreateProfile), which matters here
 * specifically because a brand-new Reconnect participant (never onboarded)
 * has no profile document yet at all.
 */
function ReconnectActivateSubForm({
  uid,
  eventId,
  onActivated,
  onBack,
}: {
  uid: string;
  eventId: string;
  onActivated: () => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const { profile, error: profileError, refresh: refreshProfile, mutate } = useSharedProfile(uid);
  const [firstName, setFirstName] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState<boolean | null>(null);
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
  const hasExistingPhoto = profile.photos.length > 0;
  const hasAnyPhoto = hasExistingPhoto || Boolean(photoPath);
  const hasContactMethod = Boolean(profile.contactPreferences.preferredMethod);
  const needsPhoneValue = contactMethod === "whatsapp" || contactMethod === "telefono";
  const needsInstagramValue = contactMethod === "instagram";
  const needsLinkedinValue = contactMethod === "linkedin";
  const needsContactValue = needsPhoneValue || needsInstagramValue || needsLinkedinValue;
  // Only actually asked once there's a photo to ask about — with none at
  // all, "show it" is trivially false and needs no answer from the person.
  const needsShowPhotoAnswer = hasAnyPhoto && showPhoto === null;

  const canSubmit =
    (hasFirstName || firstName.trim().length > 0) &&
    !needsShowPhotoAnswer &&
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
      setShowPhoto(true);
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
          showPhotoInReconnect: hasAnyPhoto ? showPhoto === true : false,
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

      {hasExistingPhoto ? (
        <div>
          <label className="text-[15px] text-ink">¿Quieres mostrar tu foto en Reconnect?</label>
          <p className="mt-1 text-[13px] text-ink-soft">
            Es tu foto habitual de Junto Select. Puedes cambiar esto más adelante.
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button type="button" onClick={() => setShowPhoto(true)} className={chipClasses(showPhoto === true)}>
              Sí, usar mi foto
            </button>
            <button type="button" onClick={() => setShowPhoto(false)} className={chipClasses(showPhoto === false)}>
              Prefiero participar sin foto
            </button>
          </div>
        </div>
      ) : (
        <div>
          <label className="text-[15px] text-ink">Una foto (opcional)</label>
          <p className="mt-1 text-[13px] text-ink-soft">Puedes activar Reconnect sin subir ninguna foto.</p>
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
          Quiero aparecer ante otras personas de este mismo evento durante
          las próximas 48 horas.
        </span>
      </label>

      {submitError && <p className="text-[13px] text-[#8a3b3b]">{submitError}</p>}

      <div className="flex flex-col gap-3">
        <button type="button" disabled={!canSubmit} onClick={handleSubmit} className={`${primaryButtonClasses} w-full`}>
          {submitting ? "Activando…" : "Activar mi Reconnect"}
        </button>
        <button type="button" onClick={onBack} className="text-[13px] text-ink-soft underline">
          Volver
        </button>
      </div>
    </div>
  );
}
