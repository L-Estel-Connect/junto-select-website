import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { ProfileDocument } from "@/lib/introduction/types";
import { evaluateHardFiltersDetailed, type HardFilterFailure } from "@/lib/matching/hardFilters";
import { scorePair } from "@/lib/matching/scoring";
import { computeMatchWhy, type MatchWhy } from "@/lib/admin/why";
import { attachConfirmedPlace, resolveProfileLocation } from "@/lib/geo/profileLocation";
import { distanceKm, getPlace, resolveCity, type Place } from "@/lib/geo/places";
import { clientAsProfile } from "./matchProfile";
import { loadConfirmedPlaces } from "./locations";
import { loadShortlistEntries } from "./shortlist";
import { CLIENTS, toClientView } from "./store";
import { clientFullName, missingForSearch, type ClientView, type ShortlistStatus } from "./types";
import {
  clientAge,
  clientCandidateUid,
  clientIsAvailableCandidate,
  loadClients,
  loadPoolProfiles,
  profileAge,
  type CandidateType,
} from "./candidatePool";

/**
 * "Buscar perfiles compatibles": every candidate in the private network,
 * compared with one client by the existing reciprocal hard filters and the
 * existing score (v5), ranked from highest to lowest. No cap, no minimum
 * score, nothing written and nobody notified: this only reads.
 *
 * The pool is the matching engine's own (finished, not a suspected or
 * confirmed duplicate, one entry per real person, legacy activation done),
 * minus the Madrid-only gate: location is a filter on the results page,
 * and each person's own "misma ciudad" requirement (20 km) still applies
 * in both directions through the hard filters. Each profile's completeness
 * is also recomputed here rather than trusting its stored status.
 */

export interface PlaceSummary {
  ine: string;
  name: string;
  province: string;
  community: string;
}

export interface CandidateResult {
  /** A profile's uid, or `cliente_<id>` for a client proposed as a candidate. */
  uid: string;
  type: CandidateType;
  personId: string;
  firstName: string;
  age: number | null;
  city: string;
  place: PlaceSummary | null;
  location: "resolved" | "confirmed" | "ambiguous" | "unknown" | "empty";
  /** For a city that couldn't be placed: the municipalities it could be. */
  locationOptions: PlaceSummary[];
  distanceKm: number | null;
  photoPath: string | null;
  photoCount: number;
  compatible: boolean;
  /** Both directions of the reciprocal check, named for the page. */
  clientAcceptsCandidate: boolean;
  candidateAcceptsClient: boolean;
  failures: HardFilterFailure[];
  score: number | null;
  why: MatchWhy | null;
  /** Searching through a paid membership (old Membresía) rather than the free private profile. */
  membership: boolean;
  shortlistStatus: ShortlistStatus | null;
  /** Other clients currently holding this person on their shortlist. */
  otherClients: { clientId: string; name: string; status: ShortlistStatus }[];
  updatedAt: string | null;
}

export interface SearchResult {
  ranAt: string;
  clientPlace: PlaceSummary | null;
  /** The client's city can't be placed yet: distance filters are unavailable until it is. */
  clientLocation: "resolved" | "ambiguous" | "unknown" | "empty";
  clientLocationOptions: PlaceSummary[];
  missing: string[];
  poolSize: number;
  compatibleCount: number;
  results: CandidateResult[];
}

function summary(p: Place): PlaceSummary {
  return { ine: p.ine, name: p.name, province: p.province, community: p.community };
}

function isoOf(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

interface PoolEntry {
  uid: string;
  personId: string;
  type: CandidateType;
  profile: ProfileDocument;
  age: number | null;
  photos: string[];
  updatedAt: string | null;
}

/**
 * Complete private profiles (no payment needed) plus other clients who
 * are available as candidates, minus the client themself. A suspected
 * duplicate waits for the team's review before it can be proposed.
 */
async function loadSearchPool(client: ClientView): Promise<PoolEntry[]> {
  const clients = await loadClients();
  const [profiles, confirmed] = await Promise.all([loadPoolProfiles(clients), loadConfirmedPlaces()]);
  const own = client.email.toLowerCase();
  const entries: PoolEntry[] = [];
  const clientsWithProfile = new Set<string>();
  for (const p of profiles) {
    if (p.clientId) clientsWithProfile.add(p.clientId);
    if (!p.complete || p.suspectedDuplicate || p.paused) continue;
    if (p.clientId === client.id || (own && p.email === own)) continue;
    const c = confirmed.get(p.uid);
    // A confirmation only answers the exact text it was given for.
    if (c && c.cityText === p.profile.visible.city) attachConfirmedPlace(p.profile, c.place);
    entries.push({
      uid: p.uid,
      personId: p.personId,
      type: p.clientId ? "cliente" : "perfil_privado",
      profile: p.profile,
      age: profileAge(p.profile),
      photos: p.profile.photos,
      updatedAt: isoOf(p.profile.meta.updatedAt),
    });
  }
  for (const other of clients) {
    if (other.id === client.id || clientsWithProfile.has(other.id) || !clientIsAvailableCandidate(other)) continue;
    if (own && other.email.toLowerCase() === own) continue;
    const uid = clientCandidateUid(other.id);
    entries.push({
      uid,
      personId: uid,
      type: "cliente",
      profile: clientAsProfile(other),
      age: clientAge(other),
      photos: [],
      updatedAt: other.updatedAt,
    });
  }
  return entries;
}

export async function searchForClient(client: ClientView): Promise<SearchResult> {
  const ranAt = new Date().toISOString();
  const missing = missingForSearch(client);
  const clientResolution = client.placeIne ? null : resolveCity(client.city);
  const clientPlaceRaw = getPlace(client.placeIne);
  const clientPlace = clientPlaceRaw ? summary(clientPlaceRaw) : null;
  const base = {
    ranAt,
    clientPlace,
    clientLocation: clientPlaceRaw
      ? ("resolved" as const)
      : clientResolution && clientResolution.status !== "resolved"
        ? clientResolution.status
        : ("unknown" as const),
    clientLocationOptions:
      clientResolution && "options" in clientResolution ? clientResolution.options.map(summary) : [],
    missing,
  };
  if (missing.length > 0) return { ...base, poolSize: 0, compatibleCount: 0, results: [] };

  const me = clientAsProfile(client);
  const [pool, shortlist, clientsSnap] = await Promise.all([
    loadSearchPool(client),
    loadShortlistEntries(),
    adminDb.collection(CLIENTS).get(),
  ]);
  const clientNames = new Map(clientsSnap.docs.map((d) => [d.id, clientFullName(toClientView(d))]));
  const activeClient = new Set(
    clientsSnap.docs.filter((d) => ["activo", "en_pausa"].includes(toClientView(d).status)).map((d) => d.id),
  );

  const candidates = pool;
  const results: CandidateResult[] = candidates.map(({ uid, personId, type, profile, age, photos, updatedAt }) => {
    const failures = evaluateHardFiltersDetailed(me, profile);
    const compatible = failures.length === 0;
    const score = compatible ? scorePair(me, profile) : null;
    const loc = resolveProfileLocation(profile);
    const place = loc.status === "resolved" ? loc.place : null;
    const mine = shortlist.find((s) => s.clientId === client.id && s.personId === personId);
    return {
      uid,
      type,
      personId,
      firstName: profile.visible.firstName,
      age,
      city: profile.visible.city,
      place: place ? summary(place) : null,
      location: loc.status === "resolved" ? (loc.via === "manual" ? "confirmed" : "resolved") : loc.status,
      locationOptions: "options" in loc ? loc.options.map(summary) : [],
      distanceKm: place && clientPlaceRaw ? Math.round(distanceKm(place, clientPlaceRaw)) : null,
      photoPath: photos[0] ?? null,
      photoCount: photos.length,
      compatible,
      clientAcceptsCandidate: !failures.some((f) => f.direction === "a_rejects_b"),
      candidateAcceptsClient: !failures.some((f) => f.direction === "b_rejects_a"),
      failures,
      score: score?.score ?? null,
      why: score ? computeMatchWhy(score) : null,
      membership: profile.meta.searchStatus === "active_search",
      shortlistStatus: mine?.status ?? null,
      otherClients: shortlist
        .filter((s) => s.personId === personId && s.clientId !== client.id && activeClient.has(s.clientId) && s.status !== "rechazado")
        .map((s) => ({ clientId: s.clientId, name: clientNames.get(s.clientId) ?? "Otro cliente", status: s.status })),
      updatedAt,
    };
  });

  results.sort((a, b) => {
    if (a.compatible !== b.compatible) return a.compatible ? -1 : 1;
    if (a.score !== b.score) return (b.score ?? -1) - (a.score ?? -1);
    return (b.why?.coveragePercent ?? 0) - (a.why?.coveragePercent ?? 0);
  });

  return {
    ...base,
    poolSize: candidates.length,
    compatibleCount: results.filter((r) => r.compatible).length,
    results,
  };
}
