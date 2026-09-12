import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb, getAdminStorageBucket } from "@/lib/firebase/admin";
import type { ProfileDocument } from "@/lib/introduction/types";
import { pairKey } from "./config";
import type { DuplicateCandidateDocument, DuplicateCandidateSignal } from "./types";

/**
 * Duplicate-account detection: see README "Duplicate accounts / profile
 * integrity" for the full design. This module only ever writes to
 * `duplicateCandidates` (an open-for-human-review queue) — it never
 * mutates a profile's `duplicateStatus` itself. A human promotes a
 * candidate pair to `suspected`/`confirmed_duplicate` (the latter via
 * identity.mergePeople), which is the actual enforcement point read by the
 * matching engine.
 *
 * Deliberately no facial recognition / biometric matching — only exact
 * identifier equality (phone/email/instagram/linkedin, all normalized) and
 * exact processed-photo byte hashes. Perceptual (near-duplicate) image
 * hashing is postponed past V1 — see README.
 */

const SIGNAL_WEIGHTS: Record<DuplicateCandidateSignal, number> = {
  phone_exact: 40,
  email_exact: 40,
  instagram_exact: 50,
  linkedin_exact: 50,
  photo_hash_exact: 50,
};

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  const digitCount = digits.replace(/\D/g, "").length;
  if (digitCount < 7) return null;
  return digits;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0) return null;
  let local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.split("+")[0].replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

function normalizeHandle(raw: string | null | undefined, hosts: string[]): string | null {
  if (!raw) return null;
  let value = raw.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  for (const host of hosts) {
    value = value.replace(new RegExp(`^(www\\.)?${host}/(in/)?`), "");
  }
  value = value.replace(/^@/, "");
  value = value.split(/[?#]/)[0];
  value = value.replace(/\/+$/, "");
  return value.length > 0 ? value : null;
}

export function normalizeInstagram(raw: string | null | undefined): string | null {
  return normalizeHandle(raw, ["instagram\\.com"]);
}

export function normalizeLinkedIn(raw: string | null | undefined): string | null {
  return normalizeHandle(raw, ["linkedin\\.com"]);
}

async function hashPhotoBytes(path: string): Promise<string | null> {
  try {
    const [bytes] = await getAdminStorageBucket().file(path).download();
    return createHash("sha256").update(bytes).digest("hex");
  } catch (error) {
    console.error("Failed to hash photo for duplicate detection", path, error);
    return null;
  }
}

interface ProfileSnapshotForDetection {
  uid: string;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  linkedin: string | null;
  photoHashes: string[];
}

function addToBucket(buckets: Map<string, Set<string>>, key: string | null, uid: string) {
  if (!key) return;
  const set = buckets.get(key) ?? new Set<string>();
  set.add(uid);
  buckets.set(key, set);
}

/**
 * Scans every profile, buckets normalized identifiers and processed-photo
 * hashes, and upserts a scored `duplicateCandidates` entry for every pair
 * of *different* uids sharing a bucket. Idempotent — safe to rerun; running
 * it again after nothing has changed just refreshes `lastDetectedAt`.
 *
 * O(profiles) reads + O(photos) Storage downloads. Fine at V1/dev scale
 * (a full collection scan); would need pagination and/or an incremental
 * per-profile trigger before this could run against a large real user base.
 */
export async function detectDuplicateCandidates(): Promise<{
  profilesScanned: number;
  candidatesWritten: number;
}> {
  const profilesSnap = await adminDb.collection("profiles").get();

  const snapshots: ProfileSnapshotForDetection[] = [];
  for (const doc of profilesSnap.docs) {
    const uid = doc.id;
    const profile = doc.data() as ProfileDocument;

    let email: string | null = null;
    try {
      const user = await adminAuth.getUser(uid);
      email = normalizeEmail(user.email);
    } catch {
      email = null;
    }

    const photoHashes: string[] = [];
    for (const path of profile.photos ?? []) {
      const hash = await hashPhotoBytes(path);
      if (hash) photoHashes.push(hash);
    }

    snapshots.push({
      uid,
      phone: normalizePhone(profile.contactPreferences?.phone),
      email,
      instagram: normalizeInstagram(profile.contactPreferences?.instagram),
      linkedin: normalizeLinkedIn(profile.contactPreferences?.linkedin),
      photoHashes,
    });
  }

  const phoneBuckets = new Map<string, Set<string>>();
  const emailBuckets = new Map<string, Set<string>>();
  const instagramBuckets = new Map<string, Set<string>>();
  const linkedinBuckets = new Map<string, Set<string>>();
  const photoBuckets = new Map<string, Set<string>>();

  for (const s of snapshots) {
    addToBucket(phoneBuckets, s.phone, s.uid);
    addToBucket(emailBuckets, s.email, s.uid);
    addToBucket(instagramBuckets, s.instagram, s.uid);
    addToBucket(linkedinBuckets, s.linkedin, s.uid);
    for (const hash of s.photoHashes) addToBucket(photoBuckets, hash, s.uid);
  }

  const pairSignals = new Map<string, { uidLow: string; uidHigh: string; signals: Set<DuplicateCandidateSignal> }>();

  function recordPairsFromBuckets(
    buckets: Map<string, Set<string>>,
    signal: DuplicateCandidateSignal,
  ) {
    for (const uids of buckets.values()) {
      if (uids.size < 2) continue;
      const list = Array.from(uids);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const key = pairKey(list[i], list[j]);
          const [uidLow, uidHigh] = [list[i], list[j]].sort();
          const entry = pairSignals.get(key) ?? { uidLow, uidHigh, signals: new Set<DuplicateCandidateSignal>() };
          entry.signals.add(signal);
          pairSignals.set(key, entry);
        }
      }
    }
  }

  recordPairsFromBuckets(phoneBuckets, "phone_exact");
  recordPairsFromBuckets(emailBuckets, "email_exact");
  recordPairsFromBuckets(instagramBuckets, "instagram_exact");
  recordPairsFromBuckets(linkedinBuckets, "linkedin_exact");
  recordPairsFromBuckets(photoBuckets, "photo_hash_exact");

  let candidatesWritten = 0;
  for (const [key, { uidLow, uidHigh, signals }] of pairSignals) {
    const signalList = Array.from(signals);
    const score = Math.min(
      100,
      signalList.reduce((sum, signal) => sum + SIGNAL_WEIGHTS[signal], 0),
    );

    const ref = adminDb.doc(`duplicateCandidates/${key}`);
    const existing = await ref.get();
    const now = FieldValue.serverTimestamp();

    if (existing.exists) {
      const prev = existing.data() as DuplicateCandidateDocument;
      await ref.update({
        score,
        signals: signalList,
        lastDetectedAt: now,
        // Never silently downgrade a status a human has already set.
        status: prev.status,
      });
    } else {
      await ref.set({
        uidLow,
        uidHigh,
        score,
        signals: signalList,
        status: "open",
        firstDetectedAt: now,
        lastDetectedAt: now,
      } satisfies Omit<DuplicateCandidateDocument, "firstDetectedAt" | "lastDetectedAt"> & {
        firstDetectedAt: unknown;
        lastDetectedAt: unknown;
      });
    }
    candidatesWritten += 1;
  }

  return { profilesScanned: snapshots.length, candidatesWritten };
}
