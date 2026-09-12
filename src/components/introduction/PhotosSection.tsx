"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MAX_PHOTOS,
  deletePhoto,
  makePrimaryPhoto,
  uploadPhoto,
} from "@/lib/introduction/photos";
import { UnsupportedImageError } from "@/lib/introduction/imageProcessing";
import { getOrCreateProfile } from "@/lib/introduction/profile";
import { getNextOnboardingRoute, getPrerequisiteRedirect } from "@/lib/introduction/completion";
import type { ProfileDocument } from "@/lib/introduction/types";
import { primaryButtonClasses } from "@/lib/styles";
import PrivatePhotoThumbnail from "./PrivatePhotoThumbnail";
import { IntroductionLoading } from "./RequireIntroductionAuth";

const linkClasses =
  "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

interface PendingPhoto {
  id: string;
  previewUrl: string;
  status: "saving" | "saved" | "error";
  errorMessage?: string;
}

export default function PhotosSection({ uid }: { uid: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileDocument | null>(null);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const objectUrlsRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    getOrCreateProfile(uid).then((doc) => {
      if (!cancelled) setProfile(doc);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    if (!profile) return;
    const redirect = getPrerequisiteRedirect(profile, "/introduction/photos");
    if (redirect) router.replace(redirect);
  }, [profile, router]);

  // Revoke every object URL this component ever created, on unmount.
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  if (!profile) {
    return <IntroductionLoading />;
  }

  if (getPrerequisiteRedirect(profile, "/introduction/photos")) {
    return <IntroductionLoading />;
  }

  function settlePending(id: string, patch: Partial<PendingPhoto>) {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removePending(id: string) {
    setPending((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item) {
        URL.revokeObjectURL(item.previewUrl);
        objectUrlsRef.current.delete(item.previewUrl);
      }
      return prev.filter((p) => p.id !== id);
    });
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    // Only one upload in flight at a time — prevents a duplicate/accidental
    // second selection while the first is still saving.
    if (!file || !profile || pending.some((p) => p.status === "saving")) return;

    setError(null);
    const id = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(previewUrl);
    setPending((prev) => [...prev, { id, previewUrl, status: "saving" }]);

    try {
      const path = await uploadPhoto(uid, file, profile);
      setProfile((prev) => (prev ? { ...prev, photos: [...prev.photos, path] } : prev));
      settlePending(id, { status: "saved" });
      window.setTimeout(() => removePending(id), 1200);
    } catch (err) {
      settlePending(id, {
        status: "error",
        errorMessage:
          err instanceof UnsupportedImageError
            ? err.message
            : "No hemos podido subir la foto. Inténtalo de nuevo.",
      });
    }
  }

  async function handleDelete(path: string) {
    if (!profile) return;
    setError(null);
    try {
      await deletePhoto(uid, path, profile);
      setProfile((prev) =>
        prev ? { ...prev, photos: prev.photos.filter((p) => p !== path) } : prev,
      );
    } catch {
      setError("No hemos podido eliminar la foto. Inténtalo de nuevo.");
    }
  }

  async function handleMakePrimary(path: string) {
    if (!profile) return;
    setError(null);
    try {
      await makePrimaryPhoto(uid, path, profile);
      setProfile((prev) =>
        prev
          ? { ...prev, photos: [path, ...prev.photos.filter((p) => p !== path)] }
          : prev,
      );
    } catch {
      setError("No hemos podido actualizar tus fotos. Inténtalo de nuevo.");
    }
  }

  const isUploading = pending.some((p) => p.status === "saving");
  const activePendingCount = pending.filter((p) => p.status !== "error").length;
  const emptySlots = Math.max(0, MAX_PHOTOS - profile.photos.length - activePendingCount);
  const canContinue = profile.photos.length >= 1;

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-6 py-14 sm:px-0">
      <Link href="/introduction/home" className={`text-sm ${linkClasses}`}>
        ← Volver a mi perfil
      </Link>

      <h1 className="mt-6 font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Tus fotos
      </h1>
      <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
        Añade al menos una foto. Son privadas: solo se usan dentro de Junto
        Select para tus futuras presentaciones.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {profile.photos.map((path, index) => (
          <div key={path} className="space-y-2">
            <PrivatePhotoThumbnail path={path} primary={index === 0} />
            <div className="flex items-center justify-between text-[13px]">
              {index !== 0 ? (
                <button
                  type="button"
                  onClick={() => handleMakePrimary(path)}
                  className={linkClasses}
                >
                  Hacer principal
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => handleDelete(path)}
                className={linkClasses}
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}

        {pending.map((p) => (
          <div key={p.id} className="space-y-2">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-hairline/40">
              {/* Local object URL — next/image can't optimize these. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.previewUrl}
                alt=""
                className={`h-full w-full object-cover ${p.status === "error" ? "opacity-40" : ""}`}
              />
              {p.status !== "error" && (
                <div className="absolute inset-x-0 bottom-0 bg-paper/95 px-2 py-2 text-center text-[12px] text-ink">
                  {p.status === "saving" ? "Guardando foto…" : "Foto guardada"}
                </div>
              )}
            </div>
            {p.status === "error" && (
              <>
                <p className="text-[12px] text-[#8a3b3b]">{p.errorMessage}</p>
                <button
                  type="button"
                  onClick={() => removePending(p.id)}
                  className={`text-[13px] ${linkClasses}`}
                >
                  Quitar
                </button>
              </>
            )}
          </div>
        ))}

        {Array.from({ length: emptySlots }).map((_, index) => (
          <label
            key={`empty-${index}`}
            className={`flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-hairline text-center text-[13px] text-ink-soft transition-colors ${
              isUploading ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-rose"
            }`}
          >
            Añadir foto
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={isUploading}
              onChange={handleFileChange}
            />
          </label>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-[#8a3b3b]">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!canContinue}
        onClick={() => router.push(getNextOnboardingRoute(profile))}
        className={`${primaryButtonClasses} mt-10 w-full`}
      >
        Continuar
      </button>
    </div>
  );
}
