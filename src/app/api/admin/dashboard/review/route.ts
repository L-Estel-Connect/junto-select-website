import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { adminDb } from "@/lib/firebase/admin";
import type { DuplicateCandidateDocument } from "@/lib/matching/types";
import { listAllProfiles } from "@/lib/admin/profiles";
import { listBlockedPairs } from "@/lib/matching/pairHistory";
import { resolvePersonId } from "@/lib/matching/identity";

export const runtime = "nodejs";

function personBrief(uid: string, rows: Awaited<ReturnType<typeof listAllProfiles>>) {
  const row = rows.find((r) => r.uid === uid);
  return {
    uid,
    firstName: row?.profile.visible.firstName ?? "(perfil no disponible)",
    photoPath: row?.profile.photos[0] ?? null,
    city: row?.profile.visible.city ?? "",
  };
}

export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const url = new URL(request.url);
  const includeResolved = url.searchParams.get("includeResolved") === "true";

  const [duplicatesSnap, rows, blockedPairs] = await Promise.all([
    adminDb.collection("duplicateCandidates").limit(2000).get(),
    listAllProfiles(),
    listBlockedPairs(),
  ]);

  const byPersonId = new Map(rows.map((r) => [resolvePersonId(r.uid, r.profile), r]));

  let duplicates = duplicatesSnap.docs.map((doc) => {
    const d = doc.data() as DuplicateCandidateDocument;
    return {
      id: doc.id,
      uidLow: d.uidLow,
      uidHigh: d.uidHigh,
      score: d.score,
      signals: d.signals,
      status: d.status,
      profileLow: personBrief(d.uidLow, rows),
      profileHigh: personBrief(d.uidHigh, rows),
    };
  });
  if (!includeResolved) {
    duplicates = duplicates.filter((d) => d.status === "open");
  }
  duplicates.sort((a, b) => b.score - a.score);

  const blocked = blockedPairs.map((p) => {
    const low = byPersonId.get(p.personIdLow);
    const high = byPersonId.get(p.personIdHigh);
    return {
      personIdLow: p.personIdLow,
      personIdHigh: p.personIdHigh,
      reason: p.blockedReason,
      personLow: low ? personBrief(low.uid, rows) : { uid: null, firstName: "(perfil no disponible)", photoPath: null, city: "" },
      personHigh: high ? personBrief(high.uid, rows) : { uid: null, firstName: "(perfil no disponible)", photoPath: null, city: "" },
    };
  });

  return NextResponse.json({ ok: true, duplicates, blocked });
}
