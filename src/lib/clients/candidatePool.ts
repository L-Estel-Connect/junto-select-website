import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { getAge } from "@/lib/introduction/age";
import { diagnoseProfileStatus } from "@/lib/introduction/completion";
import { withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";
import { resolvePersonId } from "@/lib/matching/identity";
import { birthDateForAge } from "./matchProfile";
import { CLIENTS, toClientView } from "./store";
import { missingForSearch, type ClientView } from "./types";

/**
 * Everyone the team can propose, in one place, for Candidatos and for
 * "Buscar perfiles compatibles":
 *
 * - Perfiles privados: every candidate profile, one per real person
 *   (accounts merged into the same person count once; confirmed
 *   duplicates are left out). A profile is complete when the questionnaire,
 *   photos and "lo que busca" are done (recomputed live) and the person
 *   finished it themselves. No membership or payment is involved.
 * - Clientes: paying clients are candidates for other clients too, while
 *   their programme is active and their ficha has every answer the
 *   compatibility rules need. A client who also has a private profile
 *   (same email) appears once, as that profile, marked as a client.
 */

export type CandidateType = "cliente" | "perfil_privado";

export const CLIENT_CANDIDATE_PREFIX = "cliente_";

export function clientCandidateUid(clientId: string): string {
  return `${CLIENT_CANDIDATE_PREFIX}${clientId}`;
}

export function clientIdFromCandidateUid(uid: string): string | null {
  return uid.startsWith(CLIENT_CANDIDATE_PREFIX) ? uid.slice(CLIENT_CANDIDATE_PREFIX.length) : null;
}

export interface PoolProfile {
  uid: string;
  personId: string;
  profile: ProfileDocument;
  email: string | null;
  complete: boolean;
  /** Spanish, for the admin: what's left before the profile can be proposed. */
  missing: string[];
  suspectedDuplicate: boolean;
  /** The client this person also is, when their emails match. */
  clientId: string | null;
}

export function profileAge(profile: ProfileDocument): number | null {
  const bd = profile.private.birthDate;
  return bd ? getAge(bd.toDate().toISOString().slice(0, 10)) : null;
}

export function clientAge(client: ClientView, now: Date = new Date()): number | null {
  if (client.ageYears === null) return null;
  const born = birthDateForAge(client.ageYears, client.ageRecordedOn ?? now.toISOString().slice(0, 10));
  return getAge(born.toISOString().slice(0, 10));
}

function missingSections(profile: ProfileDocument): string[] {
  if (profile.meta.pendingLegacyActivation) return ["pendiente de activar"];
  const s = diagnoseProfileStatus(profile).sections;
  const out: string[] = [];
  if (!s.aboutMe.complete) out.push("sobre ti");
  if (!s.photos.complete) out.push("fotos");
  if (!s.preferences.complete) out.push("lo que busca");
  // Answers can be all there while the person never finished the
  // questionnaire: only a profile they completed themselves is proposed.
  if (out.length === 0 && profile.meta.profileStatus !== "active_for_matching") out.push("sin terminar");
  return out;
}

export async function loadClients(): Promise<ClientView[]> {
  const snap = await adminDb.collection(CLIENTS).get();
  return snap.docs.map(toClientView);
}

/** A client the team can propose to other clients right now. */
export function clientIsAvailableCandidate(client: ClientView): boolean {
  return client.status === "activo" && missingForSearch(client).length === 0;
}

export async function loadPoolProfiles(clients?: ClientView[]): Promise<PoolProfile[]> {
  const [profilesSnap, usersSnap, allClients] = await Promise.all([
    adminDb.collection("profiles").get(),
    adminDb.collection("users").get(),
    clients ? Promise.resolve(clients) : loadClients(),
  ]);
  const emailOf = new Map(
    usersSnap.docs.map((d) => [d.id, typeof d.get("email") === "string" ? (d.get("email") as string).toLowerCase() : null]),
  );
  const clientByEmail = new Map(allClients.filter((c) => c.email).map((c) => [c.email.toLowerCase(), c.id]));

  const byPerson = new Map<string, PoolProfile>();
  for (const doc of profilesSnap.docs) {
    const profile = withProfileDefaults(doc.id, doc.data() as Partial<ProfileDocument>);
    if (profile.meta.duplicateStatus === "confirmed_duplicate") continue;
    const missing = missingSections(profile);
    const email = emailOf.get(doc.id) ?? null;
    const entry: PoolProfile = {
      uid: doc.id,
      personId: resolvePersonId(doc.id, profile),
      profile,
      email,
      complete: missing.length === 0,
      missing,
      suspectedDuplicate: profile.meta.duplicateStatus === "suspected",
      clientId: email ? clientByEmail.get(email) ?? null : null,
    };
    const seen = byPerson.get(entry.personId);
    // One line per real person: keep the complete account if only one is.
    if (!seen || (!seen.complete && entry.complete)) byPerson.set(entry.personId, entry);
  }
  return [...byPerson.values()];
}
