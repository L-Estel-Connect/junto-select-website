import "server-only";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { ContactPreferences, ProfileDocument } from "@/lib/introduction/types";

/**
 * Where a contact value was read from. Read-only: this module never writes,
 * merges or "fixes" any record. It only gathers what Junto already holds so
 * the team can reach a candidate privately (admin profile view only, never
 * a member-facing or matching payload).
 */
export type ContactSource = "cuenta" | "perfil" | "cliente" | "solicitud" | "evento" | "importacion";

export interface ContactValue {
  value: string;
  source: ContactSource;
}

export interface AdminMemberContact {
  /** The sign-in email (users/{uid}, else Firebase Auth). */
  email: ContactValue | null;
  /** Every distinct phone on record, the profile's own first. */
  phones: ContactValue[];
  preferredMethod: ContactPreferences["preferredMethod"];
  instagram: string | null;
  linkedin: string | null;
  /** The client file with the same email, when this person is also a client. */
  clientId: string | null;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // "+34 600…" and "600…" are the same Spanish number.
  return digits.length === 11 && digits.startsWith("34") ? digits.slice(2) : digits;
}

async function accountEmail(uid: string): Promise<ContactValue | null> {
  const userSnap = await adminDb.doc(`users/${uid}`).get();
  const fromDoc = text(userSnap.get("email"));
  if (fromDoc) return { value: fromDoc, source: "cuenta" };
  try {
    const fromAuth = text((await adminAuth.getUser(uid)).email);
    return fromAuth ? { value: fromAuth, source: "cuenta" } : null;
  } catch {
    return null;
  }
}

/** Equality query on one field for each spelling of the email (records are mostly, not always, lowercased). */
async function byEmail(collection: string, field: string, email: string) {
  const variants = [...new Set([email, email.toLowerCase()])];
  const snaps = await Promise.all(variants.map((v) => adminDb.collection(collection).where(field, "==", v).limit(10).get()));
  const seen = new Set<string>();
  return snaps.flatMap((s) => s.docs).filter((d) => !seen.has(d.id) && seen.add(d.id));
}

export async function getMemberContact(uid: string, profile: ProfileDocument): Promise<AdminMemberContact> {
  const email = await accountEmail(uid);
  const prefs = profile.contactPreferences;
  const phones: ContactValue[] = [];
  const keys = new Set<string>();
  const addPhone = (raw: unknown, source: ContactSource) => {
    const value = text(raw);
    const key = phoneKey(value);
    if (!key || keys.has(key)) return;
    keys.add(key);
    phones.push({ value, source });
  };
  addPhone(prefs.phone, "perfil");

  let clientId: string | null = null;
  if (email) {
    const lower = email.value.toLowerCase();
    const [clients, inquiries, participants, legacy] = await Promise.all([
      byEmail("clients", "email", email.value),
      byEmail("matchmakingInquiries", "email", email.value),
      adminDb.collection("eventParticipants").where("normalizedEmail", "==", lower).limit(20).get(),
      adminDb.collection("legacyImports").where("normalizedEmail", "==", lower).limit(5).get(),
    ]);
    clientId = clients[0]?.id ?? null;
    for (const d of clients) addPhone(d.get("phone"), "cliente");
    for (const d of inquiries) addPhone(d.get("telefono"), "solicitud");
    for (const d of participants.docs) addPhone(d.get("phone"), "evento");
    for (const d of legacy.docs) addPhone(d.get("prefill.phone"), "importacion");
  }

  return {
    email,
    phones,
    preferredMethod: prefs.preferredMethod,
    instagram: text(prefs.instagram) || null,
    linkedin: text(prefs.linkedin) || null,
    clientId,
  };
}
