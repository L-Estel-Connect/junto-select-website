"use client";

import { updateProfileFields } from "./profile";
import type { ContactPreferences } from "./types";

export async function saveContactPreferences(
  uid: string,
  contactPreferences: ContactPreferences,
): Promise<void> {
  await updateProfileFields(uid, { contactPreferences });
}

export function isValidPhone(value: string): boolean {
  return /^[+]?[\d\s()-]{7,20}$/.test(value.trim());
}

export function isValidInstagram(value: string): boolean {
  const v = value.trim();
  return /^@?[a-zA-Z0-9._]{1,30}$/.test(v) || /instagram\.com\//i.test(v);
}

export function isValidLinkedIn(value: string): boolean {
  return /linkedin\.com\//i.test(value.trim());
}

/** Whether `method` has whatever detail it needs to actually be usable. */
export function methodIsConfigured(
  method: ContactPreferences["preferredMethod"],
  contactPreferences: ContactPreferences,
): boolean {
  switch (method) {
    case "whatsapp":
    case "telefono":
      return Boolean(contactPreferences.phone && isValidPhone(contactPreferences.phone));
    case "instagram":
      return Boolean(
        contactPreferences.instagram && isValidInstagram(contactPreferences.instagram),
      );
    case "linkedin":
      return Boolean(
        contactPreferences.linkedin && isValidLinkedIn(contactPreferences.linkedin),
      );
    case "email":
      return true; // always available — the authenticated account email
    default:
      return false;
  }
}

/**
 * Not wired into any mandatory gate yet (see completion.ts / README) —
 * the natural place to require this later is alongside the other
 * matching-eligibility checks, once a real introduction flow exists to
 * actually need a contact method. Exposed now so that future gate has a
 * ready-made, already-validated check to call.
 */
export function isContactPreferencesComplete(contactPreferences: ContactPreferences): boolean {
  return (
    contactPreferences.preferredMethod !== null &&
    methodIsConfigured(contactPreferences.preferredMethod, contactPreferences)
  );
}
