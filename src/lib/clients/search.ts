import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { getAge } from "@/lib/introduction/age";
import { computeProfileStatus } from "@/lib/introduction/completion";
import type { ProfileDocument } from "@/lib/introduction/types";
import { loadEligiblePool, type EligibleProfile } from "@/lib/matching/engine";
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
  uid: string;
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

function ageOf(profile: ProfileDocument): number | null {
  const bd = profile.private.birthDate;
  return bd ? getAge(bd.toDate().toISOString().slice(0, 10)) : null;
}

function isoOf(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

/** Accounts registered with the client's own email: never shown as their own match. */
async function uidsWithEmail(email: string): Promise<Set<string>> {
  if (!email) return new Set();
  const snap = await adminDb.collection("users").where("email", "==", email).get();
  return new Set(snap.docs.map((d) => d.id));
}

export async function loadSearchPool(): Promise<EligibleProfile[]> {
  const [pool, confirmed] = await Promise.all([loadEligiblePool({ requireMadrid: false }), loadConfirmedPlaces()]);
  return pool
    .filter((p) => computeProfileStatus(p.profile) === "active_for_matching")
    .map((p) => {
      const c = confirmed.get(p.uid);
      // A confirmation only answers the exact text it was given for.
      if (c && c.cityText === p.profile.visible.city) attachConfirmedPlace(p.profile, c.place);
      return p;
    });
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
  const [pool, selfUids, shortlist, clientsSnap] = await Promise.all([
    loadSearchPool(),
    uidsWithEmail(client.email),
    loadShortlistEntries(),
    adminDb.collection(CLIENTS).get(),
  ]);
  const clientNames = new Map(clientsSnap.docs.map((d) => [d.id, clientFullName(toClientView(d))]));
  const activeClient = new Set(
    clientsSnap.docs.filter((d) => ["activo", "en_pausa"].includes(toClientView(d).status)).map((d) => d.id),
  );

  const candidates = pool.filter((p) => !selfUids.has(p.uid));
  const results: CandidateResult[] = candidates.map(({ uid, personId, profile }) => {
    const failures = evaluateHardFiltersDetailed(me, profile);
    const compatible = failures.length === 0;
    const score = compatible ? scorePair(me, profile) : null;
    const loc = resolveProfileLocation(profile);
    const place = loc.status === "resolved" ? loc.place : null;
    const mine = shortlist.find((s) => s.clientId === client.id && s.personId === personId);
    return {
      uid,
      personId,
      firstName: profile.visible.firstName,
      age: ageOf(profile),
      city: profile.visible.city,
      place: place ? summary(place) : null,
      location: loc.status === "resolved" ? (loc.via === "manual" ? "confirmed" : "resolved") : loc.status,
      locationOptions: "options" in loc ? loc.options.map(summary) : [],
      distanceKm: place && clientPlaceRaw ? Math.round(distanceKm(place, clientPlaceRaw)) : null,
      photoPath: profile.photos[0] ?? null,
      photoCount: profile.photos.length,
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
      updatedAt: isoOf(profile.meta.updatedAt),
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
