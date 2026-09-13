import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { ProfileDocument } from "@/lib/introduction/types";
import type {
  InvitationDocument,
  IntroductionDocument,
  PairHistoryDocument,
  ProposalDocument,
} from "@/lib/matching/types";
import { resolvePersonId } from "@/lib/matching/identity";
import { loadPairHistoryMapFor } from "@/lib/matching/pairHistory";
import { isProfileInEligiblePool } from "@/lib/matching/eligibility";
import { getCurrentCycle } from "@/lib/admin/matchingCycles";
import { ageOf, getProfileRow } from "./profiles";

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function toDate(ts: unknown): Date | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t?.toDate ? t.toDate() : null;
}
function isoOrNull(ts: unknown): string | null {
  return toDate(ts)?.toISOString() ?? null;
}
function monthLabel(ts: unknown): string {
  const d = toDate(ts);
  if (!d) return "Fecha desconocida";
  return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

function passTypeLabel(passType: string | null): string {
  if (passType === "no_me_interesa") return "no le interesa";
  if (passType === "ahora_no") return "ahora no";
  return "";
}

/** Human status text from the member's point of view — as recipient of a proposal, or as the invited candidate. */
function describeStatus(
  isRecipient: boolean,
  proposal: ProposalDocument,
  invitation: InvitationDocument | null,
): string {
  if (isRecipient) {
    switch (proposal.stage) {
      case "proposed":
      case "viewed":
        return "Pendiente de respuesta";
      case "member_interested":
        return "Le interesó — esperando respuesta de la otra persona";
      case "member_passed":
        return `Pasó (${passTypeLabel(proposal.passType)})`;
      case "mutual_interested":
        return "Introducción mutua";
      case "expired":
        return "Expiró";
      default:
        return "Desconocido";
    }
  }
  if (!invitation) {
    return proposal.stage === "member_passed"
      ? "No hubo interés por parte de la otra persona"
      : "Fue seleccionada — aún sin decisión de la otra persona";
  }
  switch (invitation.stage) {
    case "invited":
    case "viewed":
      return "Invitación pendiente de respuesta";
    case "candidate_interested":
      return "Le interesó";
    case "candidate_passed":
      return `Pasó (${passTypeLabel(invitation.passType)})`;
    case "mutual_interested":
      return "Introducción mutua";
    case "expired":
      return "Expiró";
    default:
      return "Desconocido";
  }
}

export interface AdminProfileView {
  uid: string;
  personId: string;
  firstName: string;
  age: number | null;
  gender: ProfileDocument["visible"]["gender"];
  city: string;
  profession: string;
  educationLevel: ProfileDocument["visible"]["educationLevel"];
  heightCm: number | null;
  languages: string[];
  hasChildren: boolean | null;
  childrenCount: number | null;
  childrenBirthYears: number[] | null;
  wantsFutureChildren: ProfileDocument["visible"]["wantsFutureChildren"];
  relationshipIntention: ProfileDocument["visible"]["relationshipIntention"];
  smoking: ProfileDocument["visible"]["smoking"];
  drinking: ProfileDocument["visible"]["drinking"];
  activityLevel: ProfileDocument["visible"]["activityLevel"];
  marketAvailability: ProfileDocument["visible"]["marketAvailability"];
  photos: string[];
  dealbreakers: ProfileDocument["dealbreakers"];
  preferences: ProfileDocument["preferences"];
  presentation: ProfileDocument["presentation"];
  profileStatus: ProfileDocument["meta"]["profileStatus"];
  searchStatus: ProfileDocument["meta"]["searchStatus"];
  duplicateStatus: ProfileDocument["meta"]["duplicateStatus"];
  duplicateOf: string | null;
  eligibleForMatching: boolean;
  createdAt: string | null;
}

// Deliberately omits `private.birthDate` (only the derived `age` is
// exposed) and `private.incomeRange` entirely — income isn't read by any
// matching filter or scoring dimension, so it has no operational use here
// (data minimization, spec §17).
function toAdminProfileView(uid: string, personId: string, profile: ProfileDocument): AdminProfileView {
  return {
    uid,
    personId,
    firstName: profile.visible.firstName,
    age: ageOf(profile),
    gender: profile.visible.gender,
    city: profile.visible.city,
    profession: profile.visible.profession,
    educationLevel: profile.visible.educationLevel,
    heightCm: profile.visible.heightCm,
    languages: profile.visible.languages,
    hasChildren: profile.visible.hasChildren,
    childrenCount: profile.visible.childrenCount,
    childrenBirthYears: profile.visible.childrenBirthYears,
    wantsFutureChildren: profile.visible.wantsFutureChildren,
    relationshipIntention: profile.visible.relationshipIntention,
    smoking: profile.visible.smoking,
    drinking: profile.visible.drinking,
    activityLevel: profile.visible.activityLevel,
    marketAvailability: profile.visible.marketAvailability,
    photos: profile.photos,
    dealbreakers: profile.dealbreakers,
    preferences: profile.preferences,
    presentation: profile.presentation,
    profileStatus: profile.meta.profileStatus,
    searchStatus: profile.meta.searchStatus,
    duplicateStatus: profile.meta.duplicateStatus,
    duplicateOf: profile.meta.duplicateOf,
    eligibleForMatching:
      profile.meta.profileStatus === "active_for_matching" && isProfileInEligiblePool(profile),
    createdAt: isoOrNull(profile.meta.createdAt),
  };
}

/** Used by the proposal/pair detail view to show both people's full admin profile side by side. */
export async function getAdminProfileViewByUid(uid: string): Promise<AdminProfileView | null> {
  const row = await getProfileRow(uid);
  if (!row) return null;
  const personId = resolvePersonId(uid, row.profile);
  return toAdminProfileView(uid, personId, row.profile);
}

export interface MatchingInteraction {
  proposalId: string;
  role: "recipient" | "candidate";
  otherUid: string;
  otherPersonId: string;
  otherFirstName: string;
  otherPhotoPath: string | null;
  cycleId: string;
  source: "algorithm" | "admin_manual";
  adminNote: string | null;
  score: number;
  scoringVersion: number;
  coverage: number;
  confidence: number;
  breakdown: ProposalDocument["scoreBreakdown"];
  createdAt: string | null;
  monthLabel: string;
  status: string;
  hasIntroduction: boolean;
  pairHistoryState: PairHistoryDocument["state"] | null;
  cooldownUntil: string | null;
  blockedReason: string | null;
}

export interface CurrentCycleStatus {
  cycleId: string;
  status: "not_processed" | "claimed" | "completed" | "failed";
  proposalCount: number | null;
  diagnostics: import("@/lib/matching/types").MemberRunDiagnostics | null;
  error: string | null;
}

export interface MemberDetail {
  uid: string;
  personId: string;
  profile: AdminProfileView;
  interactions: MatchingInteraction[];
  currentCycle: CurrentCycleStatus | null;
}

export async function getMemberDetail(uid: string): Promise<MemberDetail | null> {
  const row = await getProfileRow(uid);
  if (!row) return null;
  const { profile } = row;
  const personId = resolvePersonId(uid, profile);

  const [asRecipientSnap, asCandidateSnap, pairHistoryMap, currentCycle] = await Promise.all([
    adminDb.collection("proposals").where("recipientPersonId", "==", personId).get(),
    adminDb.collection("proposals").where("candidatePersonId", "==", personId).get(),
    loadPairHistoryMapFor(personId),
    getCurrentCycle(),
  ]);

  const proposalDocs = new Map<string, ProposalDocument>();
  for (const d of [...asRecipientSnap.docs, ...asCandidateSnap.docs]) {
    proposalDocs.set(d.id, d.data() as ProposalDocument);
  }

  const proposalIds = [...proposalDocs.keys()];
  const [invitationSnaps, introductionSnaps] = await Promise.all([
    proposalIds.length
      ? adminDb.getAll(...proposalIds.map((id) => adminDb.doc(`invitations/${id}`)))
      : Promise.resolve([]),
    proposalIds.length
      ? adminDb.getAll(...proposalIds.map((id) => adminDb.doc(`introductions/${id}`)))
      : Promise.resolve([]),
  ]);
  const invitationById = new Map<string, InvitationDocument>();
  invitationSnaps.forEach((s) => {
    if (s.exists) invitationById.set(s.id, s.data() as InvitationDocument);
  });
  const introductionById = new Map<string, IntroductionDocument>();
  introductionSnaps.forEach((s) => {
    if (s.exists) introductionById.set(s.id, s.data() as IntroductionDocument);
  });

  const otherUids = new Set<string>();
  for (const p of proposalDocs.values()) {
    const isRecipient = p.recipientPersonId === personId;
    otherUids.add(isRecipient ? p.candidateUid : p.recipientUid);
  }
  const otherUidList = [...otherUids];
  const otherSnaps = otherUidList.length
    ? await adminDb.getAll(...otherUidList.map((u) => adminDb.doc(`profiles/${u}`)))
    : [];
  const otherProfileByUid = new Map<string, ProfileDocument>();
  otherSnaps.forEach((s) => {
    if (s.exists) otherProfileByUid.set(s.id, s.data() as ProfileDocument);
  });

  const interactions: MatchingInteraction[] = [...proposalDocs.entries()]
    .map(([id, p]) => {
      const isRecipient = p.recipientPersonId === personId;
      const otherUid = isRecipient ? p.candidateUid : p.recipientUid;
      const otherPersonId = isRecipient ? p.candidatePersonId : p.recipientPersonId;
      const otherProfile = otherProfileByUid.get(otherUid);
      const invitation = invitationById.get(id) ?? null;
      const introduction = introductionById.get(id) ?? null;
      const pairHistory = pairHistoryMap.get(otherPersonId) ?? null;

      return {
        proposalId: id,
        role: (isRecipient ? "recipient" : "candidate") as "recipient" | "candidate",
        otherUid,
        otherPersonId,
        otherFirstName: otherProfile?.visible.firstName ?? "(perfil no disponible)",
        otherPhotoPath: otherProfile?.photos[0] ?? null,
        cycleId: p.cycleId,
        source: (p.source ?? "algorithm") as "algorithm" | "admin_manual",
        adminNote: p.adminSuggestion?.note ?? null,
        score: p.score,
        scoringVersion: p.scoringVersion,
        coverage: p.scoreCoverage,
        confidence: p.scoreConfidence,
        breakdown: p.scoreBreakdown,
        createdAt: isoOrNull(p.createdAt),
        monthLabel: monthLabel(p.createdAt),
        status: describeStatus(isRecipient, p, invitation),
        hasIntroduction: !!introduction,
        pairHistoryState: pairHistory?.state ?? null,
        cooldownUntil: pairHistory?.state === "passed" ? isoOrNull(pairHistory.cooldownUntil) : null,
        blockedReason: pairHistory?.state === "blocked" ? pairHistory.blockedReason : null,
      };
    })
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  let currentCycleStatus: CurrentCycleStatus | null = null;
  if (currentCycle) {
    const runSnap = await adminDb.doc(`matchingCycles/${currentCycle.id}/memberRuns/${personId}`).get();
    if (runSnap.exists) {
      const run = runSnap.data() as import("@/lib/matching/types").MemberRunDocument;
      currentCycleStatus = {
        cycleId: currentCycle.id,
        status: run.status,
        proposalCount: run.status === "completed" ? run.proposalCount : null,
        diagnostics: run.diagnostics ?? null,
        error: run.error,
      };
    } else {
      currentCycleStatus = {
        cycleId: currentCycle.id,
        status: "not_processed",
        proposalCount: null,
        diagnostics: null,
        error: null,
      };
    }
  }

  return {
    uid,
    personId,
    profile: toAdminProfileView(uid, personId, profile),
    interactions,
    currentCycle: currentCycleStatus,
  };
}
