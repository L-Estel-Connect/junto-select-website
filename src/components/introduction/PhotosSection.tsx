"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import Link from "next/link";
import {
  MAX_PHOTOS,
  deletePhoto,
  makePrimaryPhoto,
  uploadPhoto,
} from "@/lib/introduction/photos";
import { UnsupportedImageError } from "@/lib/introduction/imageProcessing";
import { getOrCreateProfile } from "@/lib/introduction/profile";
import type { ProfileDocument } from "@/lib/introduction/types";
import PrivatePhotoThumbnail from "./PrivatePhotoThumbnail";
import { IntroductionLoading } from "./RequireIntroductionAuth";

const linkClasses =
  "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

export default function PhotosSection({ uid }: { uid: string }) {
  const [profile, setProfile] = useState<ProfileDocument | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrCreateProfile(uid).then((doc) => {
      if (!cancelled) setProfile(doc);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (!profile) {
    return <IntroductionLoading />;
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !profile) return;

    setError(null);
    setUploading(true);
    try {
      const path = await uploadPhoto(uid, file, profile);
      setProfile((prev) =>
        prev ? { ...prev, photos: [...prev.photos, path] } : prev,
      );
    } catch (err) {
      setError(
        err instanceof UnsupportedImageError
          ? err.message
          : "No hemos podido subir la foto. Inténtalo de nuevo.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(path: string) {
    if (!profile) return;
    setError(null);
    try {
      await deletePhoto(uid, path, profile);
      setProfile((prev) =>
        prev
          ? { ...prev, photos: prev.photos.filter((p) => p !== path) }
          : prev,
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

  const emptySlots = Math.max(0, MAX_PHOTOS - profile.photos.length);

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

        {Array.from({ length: emptySlots }).map((_, index) => (
          <label
            key={`empty-${index}`}
            className="flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-hairline text-center text-[13px] text-ink-soft transition-colors hover:border-rose"
          >
            {uploading ? "Subiendo…" : "Añadir foto"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading}
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
    </div>
  );
}
