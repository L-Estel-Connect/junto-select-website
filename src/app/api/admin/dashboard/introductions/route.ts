import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { adminDb } from "@/lib/firebase/admin";
import type { IntroductionDocument, InvitationDocument, ProposalDocument } from "@/lib/matching/types";
import { buildPersonIndex, listAllProfiles } from "@/lib/admin/profiles";

export const runtime = "nodejs";

function isoOrNull(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const [introductionsSnap, rows] = await Promise.all([
    adminDb.collection("introductions").limit(2000).get(),
    listAllProfiles(),
  ]);
  const index = buildPersonIndex(rows);

  const ids = introductionsSnap.docs.map((d) => d.id);
  const [proposalSnaps, invitationSnaps] = await Promise.all([
    ids.length ? adminDb.getAll(...ids.map((id) => adminDb.doc(`proposals/${id}`))) : Promise.resolve([]),
    ids.length ? adminDb.getAll(...ids.map((id) => adminDb.doc(`invitations/${id}`))) : Promise.resolve([]),
  ]);
  const proposalById = new Map<string, ProposalDocument>();
  proposalSnaps.forEach((s) => {
    if (s.exists) proposalById.set(s.id, s.data() as ProposalDocument);
  });
  const invitationById = new Map<string, InvitationDocument>();
  invitationSnaps.forEach((s) => {
    if (s.exists) invitationById.set(s.id, s.data() as InvitationDocument);
  });

  const items = introductionsSnap.docs.map((doc) => {
    const intro = doc.data() as IntroductionDocument;
    const proposal = proposalById.get(doc.id) ?? null;
    const invitation = invitationById.get(doc.id) ?? null;
    const personA = index.get(intro.personIdA);
    const personB = index.get(intro.personIdB);

    return {
      id: doc.id,
      personA: {
        personId: intro.personIdA,
        uid: personA?.uid ?? intro.uidA,
        firstName: personA?.profile.visible.firstName ?? "(perfil no disponible)",
        photoPath: personA?.profile.photos[0] ?? null,
      },
      personB: {
        personId: intro.personIdB,
        uid: personB?.uid ?? intro.uidB,
        firstName: personB?.profile.visible.firstName ?? "(perfil no disponible)",
        photoPath: personB?.profile.photos[0] ?? null,
      },
      originalScore: proposal?.score ?? null,
      selectedAt: isoOrNull(proposal?.createdAt),
      mutualAt: isoOrNull(invitation?.decidedAt),
      introducedAt: isoOrNull(intro.createdAt),
      contactRevealedAt: isoOrNull(intro.contactRevealedAt),
      source: proposal?.source ?? "algorithm",
    };
  });

  items.sort((a, b) => (b.introducedAt ?? "").localeCompare(a.introducedAt ?? ""));

  return NextResponse.json({ ok: true, items });
}
