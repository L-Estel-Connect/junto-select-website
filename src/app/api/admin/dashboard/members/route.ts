import { NextResponse } from "next/server";
import { requireAdminOrRespond } from "@/lib/admin/apiGuard";
import { listAllProfiles, loadSuspectedDuplicateUids, toMemberSummary, type MemberSummary } from "@/lib/admin/profiles";
import { getCurrentCycle, getCycleMemberRuns } from "@/lib/admin/matchingCycles";

export const runtime = "nodejs";

export type MemberFilter =
  | "all"
  | "active_search"
  | "passive"
  | "eligible"
  | "ineligible"
  | "incomplete"
  | "sel0"
  | "sel1"
  | "sel2"
  | "sel3"
  | "dup_suspected"
  | "dup_confirmed";

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

/**
 * V1-scale members list: one bounded profiles read, filtered/searched/
 * paginated in memory (see profiles.ts doc comment) — only the current
 * page is returned to the browser.
 */
export async function GET(request: Request) {
  const admin = await requireAdminOrRespond(request);
  if (admin instanceof NextResponse) return admin;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const filter = (url.searchParams.get("filter") ?? "all") as MemberFilter;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? String(PAGE_SIZE_DEFAULT)) || PAGE_SIZE_DEFAULT),
  );

  const [rows, suspectedDuplicateUids] = await Promise.all([listAllProfiles(), loadSuspectedDuplicateUids()]);

  let selectionByPersonId: Map<string, number> | null = null;
  if (filter === "sel0" || filter === "sel1" || filter === "sel2" || filter === "sel3") {
    const currentCycle = await getCurrentCycle();
    selectionByPersonId = new Map();
    if (currentCycle) {
      const runs = await getCycleMemberRuns(currentCycle.id);
      for (const run of runs) {
        if (run.data.status === "completed") selectionByPersonId.set(run.id, run.data.proposalCount);
      }
    }
  }

  let summaries: MemberSummary[] = rows.map((r) => toMemberSummary(r.uid, r.profile, suspectedDuplicateUids));

  if (q) {
    summaries = summaries.filter((m) => m.firstName.toLowerCase().includes(q) || m.city.toLowerCase().includes(q));
  }

  switch (filter) {
    case "active_search":
      summaries = summaries.filter((m) => m.searchStatus === "active_search");
      break;
    case "passive":
      summaries = summaries.filter((m) => m.searchStatus === "passive");
      break;
    case "eligible":
      summaries = summaries.filter((m) => m.eligibleForMatching);
      break;
    case "ineligible":
      summaries = summaries.filter((m) => !m.eligibleForMatching);
      break;
    case "incomplete":
      summaries = summaries.filter((m) => m.profileStatus !== "active_for_matching");
      break;
    case "dup_suspected":
      summaries = summaries.filter((m) => m.suspectedDuplicate);
      break;
    case "dup_confirmed":
      summaries = summaries.filter((m) => m.duplicateStatus === "confirmed_duplicate");
      break;
    case "sel0":
    case "sel1":
    case "sel2":
    case "sel3": {
      const target = Number(filter.slice(3));
      summaries = summaries.filter((m) => {
        const count = selectionByPersonId?.get(m.personId);
        return target === 3 ? (count ?? -1) >= 3 : count === target;
      });
      break;
    }
    case "all":
    default:
      break;
  }

  summaries.sort((a, b) => a.firstName.localeCompare(b.firstName, "es"));

  const total = summaries.length;
  const start = (page - 1) * pageSize;
  const items = summaries.slice(start, start + pageSize);

  return NextResponse.json({ ok: true, items, total, page, pageSize });
}
