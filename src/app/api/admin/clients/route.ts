import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { readJson, todayMadrid, validationResponse } from "@/lib/clients/api";
import { clientFromInquiry } from "@/lib/clients/fromInquiry";
import { loadShortlistEntries } from "@/lib/clients/shortlist";
import { createClient, listClients } from "@/lib/clients/store";
import { COUNTS_AS_PROPOSAL } from "@/lib/clients/types";
import { sanitizeClientPatch } from "@/lib/clients/validate";

export const runtime = "nodejs";

/** Every client, newest first, with their shortlist counts for the list page. */
export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const [clients, entries] = await Promise.all([listClients(), loadShortlistEntries()]);
  const items = clients.map((c) => {
    const mine = entries.filter((e) => e.clientId === c.id);
    return {
      client: c,
      shortlisted: mine.filter((e) => e.status !== "rechazado" && !e.deletedCandidate).length,
      presented: mine.filter((e) => COUNTS_AS_PROPOSAL.includes(e.status)).length,
      lastActivity: [c.updatedAt, ...mine.map((e) => e.updatedAt)].filter(Boolean).sort().pop() ?? null,
    };
  });
  return NextResponse.json({ ok: true, items });
}

/** A new client: empty, with a few first fields, or converted from a /matchmaking request. */
export async function POST(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;

  if (typeof body.fromInquiryId === "string") {
    const result = await clientFromInquiry(body.fromInquiryId, admin.email);
    if (!result) return NextResponse.json({ ok: false, error: "inquiry_not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, client: result.client, created: result.created });
  }

  try {
    const initial = sanitizeClientPatch(body, todayMadrid());
    const client = await createClient(initial, admin.email);
    return NextResponse.json({ ok: true, client, created: true });
  } catch (error) {
    return validationResponse(error);
  }
}
