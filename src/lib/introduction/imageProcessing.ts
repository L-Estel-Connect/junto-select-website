"use client";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export class UnsupportedImageError extends Error {}

/**
 * Validates and re-encodes a photo before upload: decodes it via
 * `createImageBitmap` with `imageOrientation: "from-image"` (applies any
 * EXIF rotation so the photo displays right-side up), then redraws it onto
 * a canvas at a bounded size and re-exports as JPEG. Re-encoding through
 * canvas is what strips all metadata (EXIF, GPS location, camera info) —
 * canvas pixel data carries none of it — so this single step both fixes
 * orientation and removes anything privacy-sensitive baked into the file.
 */
export async function processPhotoFile(file: File): Promise<Blob> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new UnsupportedImageError(
      "Este formato de imagen no es compatible. Usa una foto en JPG, PNG o WEBP.",
    );
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new UnsupportedImageError(
      "Esta imagen pesa demasiado. Elige una foto de menos de 20 MB.",
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new UnsupportedImageError(
      "No hemos podido leer esta imagen. Prueba con otra foto.",
    );
  }

  const scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new UnsupportedImageError("No hemos podido procesar esta imagen.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) {
    throw new UnsupportedImageError("No hemos podido procesar esta imagen.");
  }
  return blob;
}
