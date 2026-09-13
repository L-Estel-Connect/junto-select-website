import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { InvitationDocument, IntroductionDocument, ProposalDocument } from "@/lib/matching/types";
import { buildPersonIndex, listAllProfiles, type ProfileRow } from "./profiles";

export interface ProposalSummary {
  id: string;
  recipient: { personId: string; uid: string | null; firstName: string; photoPath: string | null };
  candidate: { personId: string; uid: string | null; firstName: string; photoPath: string | null };
  score: number;
  confidence: number;
  cycleId: string;
  source: "algorithm" | "admin_manual";
  stage: ProposalDocument["stage"];
  invitationStage: InvitationDocument["stage"] | null;
  mutual: boolean;
  introduced: boolean;
  createdAt: string | null;
}

function personRef(personId: string, index: Map<string, ProfileRow>) {
  const row = index.get(personId);
  return {
    personId,
    uid: row?.uid ?? null,
    firstName: row?.profile.visible.firstName ?? "(perfil no disponible)",
    photoPath: row?.profile.photos[0] ?? null,
  };
}

function isoOrNull(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

/** Bounded, in-memory-filterable proposal listing — see profiles.ts doc comment for the V1-scale rationale. */
export async function listAllProposalSummaries(): Promise<ProposalSummary[]> {
  const [proposalsSnap, invitationsSnap, introductionsSnap, rows] = await Promise.all([
    adminDb.collection("proposals").limit(10000).get(),
    adminDb.collection("invitations").limit(10000).get(),
    adminDb.collection("introductions").limit(10000).get(),
    listAllProfiles(),
  ]);

  const index = buildPersonIndex(rows);
  const invitationById = new Map<string, InvitationDocument>();
  invitationsSnap.docs.forEach((d) => invitationById.set(d.id, d.data() as InvitationDocument));
  const introductionIds = new Set<string>();
  introductionsSnap.docs.forEach((d) => introductionIds.add(d.id));

  return proposalsSnap.docs.map((doc) => {
    const p = doc.data() as ProposalDocument;
    const invitation = invitationById.get(doc.id) ?? null;
    return {
      id: doc.id,
      recipient: personRef(p.recipientPersonId, index),
      candidate: personRef(p.candidatePersonId, index),
      score: p.score,
      confidence: p.scoreConfidence,
      cycleId: p.cycleId,
      source: p.source ?? "algorithm",
      stage: p.stage,
      invitationStage: invitation?.stage ?? null,
      mutual: p.stage === "mutual_interested",
      introduced: introductionIds.has(doc.id),
      createdAt: isoOrNull(p.createdAt),
    };
  });
}

export type ProposalDetailFull = {
  id: string;
  proposal: ProposalDocument;
  invitation: InvitationDocument | null;
  introduction: IntroductionDocument | null;
};

export async function getProposalDetail(id: string): Promise<ProposalDetailFull | null> {
  const [proposalSnap, invitationSnap, introductionSnap] = await Promise.all([
    adminDb.doc(`proposals/${id}`).get(),
    adminDb.doc(`invitations/${id}`).get(),
    adminDb.doc(`introductions/${id}`).get(),
  ]);
  if (!proposalSnap.exists) return null;
  return {
    id,
    proposal: proposalSnap.data() as ProposalDocument,
    invitation: invitationSnap.exists ? (invitationSnap.data() as InvitationDocument) : null,
    introduction: introductionSnap.exists ? (introductionSnap.data() as IntroductionDocument) : null,
  };
}
