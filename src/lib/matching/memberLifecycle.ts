import "server-only";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { buildPublicProfileView, buildRevealedContacts } from "@/lib/introduction/publicProfile";
import { withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";
import { recordCandidateDecision, recordInvitationViewed, recordMemberDecision, recordProposalViewed } from "./pairHistory";
import type { InvitationDocument, IntroductionDocument, PassType, ProposalDocument } from "./types";
import type {
  MemberDecisionResult,
  MemberIntroductionView,
  MemberInvitationView,
  MemberLifecycleSummary,
  MemberProposalView,
} from "./memberLifecycleTypes";

/**
 * The member-facing lifecycle: exposes the ALREADY-BUILT proposal ->
 * invitation -> introduction backend (see pairHistory.ts / types.ts) to a
 * real signed-in member, safely. Every function here is called from an API
 * route that has already verified a Firebase ID token (see
 * requireFirebaseUser) and re-verifies OWNERSHIP of the specific document
 * before ever reading or deciding on it — the calling uid is never trusted
 * beyond what it is authenticated as. Nothing here invents new lifecycle
 * semantics: it only reads existing collections and calls the existing
 * recordMemberDecision/recordCandidateDecision, then reshapes the result
 * through buildPublicProfileView so a client can never see anything beyond
 * `visible` + photos + approved presentation text for the OTHER party —
 * never dealbreakers, preferences, score, or admin metadata.
 */

async function loadProfile(uid: string): Promise<ProfileDocument | null> {
  const snap = await adminDb.doc(`profiles/${uid}`).get();
  if (!snap.exists) return null;
  return withProfileDefaults(uid, snap.data() as Partial<ProfileDocument>);
}

// --- Proposals (stage 1: the algorithm's/admin's selection, shown to the recipient) ---

/**
 * Every proposal ever made FOR this member — both `source: "algorithm"`
 * and `source: "admin_manual"` are returned identically (the member-facing
 * lifecycle never distinguishes them; that's an admin-only concept — see
 * ProposalDocument.source's own doc comment). A proposal whose candidate
 * profile has since been deleted is still returned (never silently
 * dropped — the recipient's decision history must stay honest) but with
 * `candidate: null`, so the UI can show a graceful "ya no disponible"
 * state instead of crashing on a missing join.
 */
export async function getProposalsForMember(uid: string): Promise<MemberProposalView[]> {
  const snap = await adminDb.collection("proposals").where("recipientUid", "==", uid).get();
  const proposals = snap.docs.map((d) => ({ id: d.id, data: d.data() as ProposalDocument }));

  const results = await Promise.all(
    proposals.map(async ({ id, data }) => {
      const candidateProfile = await loadProfile(data.candidateUid);
      // Best-effort telemetry only — never blocks or affects the response.
      recordProposalViewed(id).catch(() => {});
      return {
        id,
        stage: data.stage,
        passType: data.passType,
        createdAt: data.createdAt,
        candidate: candidateProfile ? buildPublicProfileView(data.candidateUid, candidateProfile) : null,
      };
    }),
  );

  return results;
}

export async function decideProposalForMember(
  uid: string,
  proposalId: string,
  decision: "interested" | "passed",
  passType: PassType | null,
): Promise<MemberDecisionResult> {
  const snap = await adminDb.doc(`proposals/${proposalId}`).get();
  if (!snap.exists) return { ok: false, error: "not_found" };
  const proposal = snap.data() as ProposalDocument;
  // The one authorization check that matters: this proposal must actually
  // have been generated FOR this signed-in uid. recordMemberDecision itself
  // has no notion of "who is asking" — this is that check.
  if (proposal.recipientUid !== uid) return { ok: false, error: "not_your_proposal" };

  try {
    const result = await recordMemberDecision(proposalId, decision, passType);
    return { ok: true, alreadyRecorded: result.alreadyRecorded };
  } catch {
    // recordMemberDecision throws only when asked to record the OPPOSITE
    // of an already-final decision (e.g. Pasar after already having said
    // Me interesa) — a genuine conflict, not a crash-worthy bug.
    return { ok: false, error: "cannot_decide" };
  }
}

// --- Invitations (stage 2: the free, no-membership-required response) ---

/**
 * Every invitation ever sent TO this member — created only once the
 * ORIGINAL member said Interested, so by construction the inviter is
 * already known to be interested; this never checks the recipient's own
 * membership/searchStatus, because responding must stay free for a
 * passive/free candidate (see README "Free/passive behavior").
 */
export async function getInvitationsForMember(uid: string): Promise<MemberInvitationView[]> {
  const snap = await adminDb.collection("invitations").where("recipientUid", "==", uid).get();
  const invitations = snap.docs.map((d) => ({ id: d.id, data: d.data() as InvitationDocument }));

  return Promise.all(
    invitations.map(async ({ id, data }) => {
      const inviterProfile = await loadProfile(data.inviterUid);
      recordInvitationViewed(id).catch(() => {});
      return {
        id,
        stage: data.stage,
        passType: data.passType,
        createdAt: data.createdAt,
        inviter: inviterProfile ? buildPublicProfileView(data.inviterUid, inviterProfile) : null,
      };
    }),
  );
}

export async function decideInvitationForMember(
  uid: string,
  invitationId: string,
  decision: "interested" | "passed",
  passType: PassType | null,
): Promise<MemberDecisionResult> {
  const snap = await adminDb.doc(`invitations/${invitationId}`).get();
  if (!snap.exists) return { ok: false, error: "not_found" };
  const invitation = snap.data() as InvitationDocument;
  if (invitation.recipientUid !== uid) return { ok: false, error: "not_your_proposal" };

  try {
    const result = await recordCandidateDecision(invitationId, decision, passType);
    return { ok: true, alreadyRecorded: result.alreadyRecorded };
  } catch {
    return { ok: false, error: "cannot_decide" };
  }
}

// --- Introductions (stage 3: mutual interest, contact reveal) ---

/**
 * Contact details are ONLY ever assembled here, from an introduction
 * document the member is a genuine party to (already re-verified by uid
 * equality against the query itself, not client input) — there is no
 * other path in this codebase that returns another member's
 * contactPreferences. `email` resolves through Firebase Auth (see
 * ContactPreferences' doc comment), everything else from the profile doc.
 */
export async function getIntroductionsForMember(uid: string): Promise<MemberIntroductionView[]> {
  const [asA, asB] = await Promise.all([
    adminDb.collection("introductions").where("uidA", "==", uid).get(),
    adminDb.collection("introductions").where("uidB", "==", uid).get(),
  ]);
  const docs = [...asA.docs, ...asB.docs];

  return Promise.all(
    docs.map(async (d) => {
      const data = d.data() as IntroductionDocument;
      const otherUid = data.uidA === uid ? data.uidB : data.uidA;
      const otherProfile = await loadProfile(otherUid);
      if (!otherProfile) {
        return { id: d.id, createdAt: data.createdAt, other: null, contacts: [] };
      }
      let accountEmail: string | null = null;
      try {
        accountEmail = (await adminAuth.getUser(otherUid)).email ?? null;
      } catch {
        accountEmail = null;
      }
      return {
        id: d.id,
        createdAt: data.createdAt,
        other: buildPublicProfileView(otherUid, otherProfile),
        contacts: buildRevealedContacts(otherProfile.contactPreferences, accountEmail),
      };
    }),
  );
}

// --- Dashboard summary (Phase 7: obvious action visibility, no new infra) ---

const PROPOSAL_ACTIONABLE_STAGES: ProposalDocument["stage"][] = ["proposed", "viewed"];
const INVITATION_ACTIONABLE_STAGES: InvitationDocument["stage"][] = ["invited", "viewed"];

/** Cheap counts for the dashboard/nav badges — never the full joined payload. */
export async function getLifecycleSummaryForMember(uid: string): Promise<MemberLifecycleSummary> {
  const [proposalsSnap, invitationsSnap, introAsA, introAsB] = await Promise.all([
    adminDb.collection("proposals").where("recipientUid", "==", uid).get(),
    adminDb.collection("invitations").where("recipientUid", "==", uid).get(),
    adminDb.collection("introductions").where("uidA", "==", uid).get(),
    adminDb.collection("introductions").where("uidB", "==", uid).get(),
  ]);

  const proposalsWaitingForDecision = proposalsSnap.docs.filter((d) =>
    PROPOSAL_ACTIONABLE_STAGES.includes((d.data() as ProposalDocument).stage),
  ).length;
  const invitationsWaitingForDecision = invitationsSnap.docs.filter((d) =>
    INVITATION_ACTIONABLE_STAGES.includes((d.data() as InvitationDocument).stage),
  ).length;

  return {
    proposalsWaitingForDecision,
    invitationsWaitingForDecision,
    mutualIntroductionsCount: introAsA.size + introAsB.size,
  };
}
