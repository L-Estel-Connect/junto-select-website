import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { clientAge, loadClients, loadPoolProfiles, profileAge, type CandidateType } from "@/lib/clients/candidatePool";
import { missingForSearch } from "@/lib/clients/types";

export const runtime = "nodejs";

export interface CandidateRow {
  key: string;
  /** Where the row opens: the profile, or the client's ficha. */
  href: string;
  type: CandidateType;
  photoPath: string | null;
  firstName: string;
  age: number | null;
  gender: string | null;
  city: string;
  complete: boolean;
  missing: string[];
  suspectedDuplicate: boolean;
  /** Asked not to be presented for now; left out of every search. */
  paused: boolean;
}

/**
 * Candidatos: every private profile (one per real person) and every
 * client, with what's still missing for each. Small enough to send whole;
 * the page filters it.
 */
export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const clients = await loadClients();
  const profiles = await loadPoolProfiles(clients);
  const withProfile = new Set(profiles.map((p) => p.clientId).filter(Boolean));

  const rows: CandidateRow[] = profiles.map((p) => ({
    key: p.uid,
    href: `/admin/members/${p.uid}`,
    type: p.clientId ? "cliente" : "perfil_privado",
    photoPath: p.profile.photos[0] ?? null,
    firstName: p.profile.visible.firstName || "Sin nombre",
    age: profileAge(p.profile),
    gender: p.profile.visible.gender,
    city: p.profile.visible.city,
    complete: p.complete,
    missing: p.missing,
    suspectedDuplicate: p.suspectedDuplicate,
    paused: p.paused,
  }));
  for (const c of clients) {
    if (withProfile.has(c.id) || c.status === "cancelado") continue;
    const missing = missingForSearch(c);
    rows.push({
      key: `cliente_${c.id}`,
      href: `/admin/clientes/${c.id}`,
      type: "cliente",
      photoPath: null,
      firstName: c.firstName || "Sin nombre",
      age: clientAge(c),
      gender: c.profile.visible.gender,
      city: c.city,
      complete: missing.length === 0,
      missing: missing.length ? ["ficha"] : [],
      suspectedDuplicate: false,
      paused: c.status !== "activo",
    });
  }
  rows.sort((a, b) => a.firstName.localeCompare(b.firstName, "es"));
  return NextResponse.json({ ok: true, items: rows });
}
