"use client";

import {
  deleteObject,
  ref,
  uploadBytes,
  type StorageReference,
} from "firebase/storage";
import { storage } from "@/lib/firebase/client";
import { updateProfileFields } from "./profile";
import { computeProfileStatus } from "./completion";
import type { ProfileDocument } from "./types";
import { processPhotoFile } from "./imageProcessing";
import { invalidatePhoto, seedPhotoCache } from "./photoCache";

/**
 * Current business rule for how many photos a profile may have. Deliberately
 * just this one constant — Storage rules only check per-file constraints
 * (owner, size, content type), never a total count, so raising this to 6
 * later needs no rules change and no data migration, only this number.
 */
export const MAX_PHOTOS = 3;

function photoRef(uid: string, photoId: string): StorageReference {
  return ref(storage, `profiles/${uid}/photos/${photoId}`);
}

/**
 * Uploads one photo and appends it to the profile's photo list, then
 * recomputes and persists profile completion/eligibility. Photos are
 * stored as Storage paths (not download URLs) — see photoCache.ts for
 * why: a download URL's token bypasses Storage Security Rules for anyone
 * who ever obtains it, which is wrong for something meant to stay private.
 *
 * Seeds the photo cache directly from the already-in-memory processed
 * `blob` before returning — the browser already has these exact bytes, so
 * the `PrivatePhotoThumbnail` that mounts for this new path an instant
 * later renders immediately instead of re-downloading what was just
 * uploaded.
 */
export async function uploadPhoto(
  uid: string,
  file: File,
  profile: ProfileDocument,
): Promise<string> {
  const blob = await processPhotoFile(file);
  const photoId = crypto.randomUUID();
  await uploadBytes(photoRef(uid, photoId), blob, {
    contentType: "image/jpeg",
  });

  const path = `profiles/${uid}/photos/${photoId}`;
  seedPhotoCache(path, blob);
  const nextPhotos = [...profile.photos, path];

  await persistPhotos(uid, nextPhotos, profile);
  return path;
}

export async function deletePhoto(
  uid: string,
  path: string,
  profile: ProfileDocument,
): Promise<void> {
  // Firestore first, then Storage — deliberately in this order. If this
  // were reversed and the Storage delete succeeded but the Firestore
  // write then failed, `profile.photos` would keep pointing at an object
  // that no longer exists, and every future page load would try to load
  // it and fail. An orphaned Storage object (Firestore write succeeds,
  // Storage delete fails below) is harmless by comparison — nothing ever
  // references it again — so that's the safe order to fail in.
  const nextPhotos = profile.photos.filter((p) => p !== path);
  await persistPhotos(uid, nextPhotos, profile);
  invalidatePhoto(path);
  await deleteObject(ref(storage, path)).catch(() => {
    // Already gone, or this cleanup step failed — either way the
    // Firestore list (already updated above) is the source of truth for
    // what the UI shows.
  });
}

/** Moves `path` to index 0 (the primary photo shown first). */
export async function makePrimaryPhoto(
  uid: string,
  path: string,
  profile: ProfileDocument,
): Promise<void> {
  const nextPhotos = [path, ...profile.photos.filter((p) => p !== path)];
  await persistPhotos(uid, nextPhotos, profile);
}

async function persistPhotos(
  uid: string,
  photos: string[],
  profile: ProfileDocument,
) {
  const profileStatus = computeProfileStatus({ ...profile, photos });
  await updateProfileFields(
    uid,
    { photos },
    { photosComplete: photos.length >= 1, profileStatus },
  );
}
