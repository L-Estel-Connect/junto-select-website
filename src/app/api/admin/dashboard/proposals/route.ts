import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { listAllProposalSummaries } from "@/lib/admin/proposalsList";
import { getCurrentCycle } from "@/lib/admin/matchingCycles";

export const runtime = "nodejs";

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const filter = url.searchParams.get("filter") ?? "all";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? String(PAGE_SIZE_DEFAULT)) || PAGE_SIZE_DEFAULT),
  );

  let items = await listAllProposalSummaries();

  if (q) {
    items = items.filter(
      (p) => p.recipient.firstName.toLowerCase().includes(q) || p.candidate.firstName.toLowerCase().includes(q),
    );
  }

  if (filter === "current_cycle") {
    const currentCycle = await getCurrentCycle();
    items = items.filter((p) => p.cycleId === currentCycle?.id);
  } else if (filter === "pending") {
    items = items.filter((p) => p.stage === "proposed" || p.stage === "viewed");
  } else if (filter === "member_interested") {
    items = items.filter((p) => p.stage === "member_interested");
  } else if (filter === "member_passed") {
    items = items.filter((p) => p.stage === "member_passed");
  } else if (filter === "invitation_sent") {
    items = items.filter((p) => p.invitationStage !== null);
  } else if (filter === "candidate_interested") {
    items = items.filter((p) => p.invitationStage === "candidate_interested" || p.invitationStage === "mutual_interested");
  } else if (filter === "candidate_passed") {
    items = items.filter((p) => p.invitationStage === "candidate_passed");
  } else if (filter === "mutual") {
    items = items.filter((p) => p.mutual);
  } else if (filter === "introduced") {
    items = items.filter((p) => p.introduced);
  }

  items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  const total = items.length;
  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return NextResponse.json({ ok: true, items: pageItems, total, page, pageSize });
}
