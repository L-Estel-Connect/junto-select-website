"use client";

import Link from "next/link";
import type { MemberConnectionSummaryView } from "@/lib/matching/memberLifecycleTypes";
import PublicPhotoThumbnail from "./PublicPhotoThumbnail";

function formatShortDate(value: unknown): string | null {
  const ts = value as { toDate?: () => Date } | null | undefined;
  const date = ts?.toDate ? ts.toDate() : null;
  if (!date) return null;
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A compact, scannable overview of ONE mutual connection for
 * /member/connections — deliberately never the full profile or any
 * revealed contact detail (see MemberConnectionSummaryView's own doc
 * comment): those only ever appear on /member/connections/[id], once the
 * member explicitly opens this specific connection.
 *
 * The entire card is one <Link> — a single, large, unambiguous tap
 * target (important on mobile), which also gives it a real accessible
 * name from its own text content with no extra aria- plumbing needed.
 * Name/city are truncated (with a `min-w-0` flex child, required for
 * `truncate` to actually clip inside a flex row) so a long value can
 * never break the card's layout or force horizontal scroll.
 */
export default function ConnectionCard({ connection }: { connection: MemberConnectionSummaryView }) {
  const date = formatShortDate(connection.createdAt);

  if (!connection.other) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-hairline bg-white p-4">
        <div className="aspect-[3/4] w-20 shrink-0 rounded-md bg-hairline/40" />
        <p className="text-[14px] text-ink-soft">Esta persona ya no está disponible.</p>
      </div>
    );
  }

  const { firstName, age, city, primaryPhoto } = connection.other;

  return (
    <Link
      href={`/member/connections/${connection.id}`}
      className="flex items-start gap-4 rounded-2xl border border-hairline bg-white p-4 transition-colors hover:border-rose"
    >
      <div className="w-20 shrink-0 overflow-hidden rounded-md">
        {primaryPhoto ? (
          <PublicPhotoThumbnail path={primaryPhoto} />
        ) : (
          <div className="flex aspect-[3/4] w-full items-center justify-center bg-hairline/40">
            <span className="px-1 text-center text-[11px] text-ink-soft">Sin foto</span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-medium text-ink">
          {firstName || "Sin nombre"}
          {age ? `, ${age}` : ""}
        </p>
        {city && <p className="mt-0.5 truncate text-[14px] text-ink-soft">{city}</p>}
        <p className="mt-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-soft">
          Interés mutuo{date ? ` · ${date}` : ""}
        </p>
        <p className="mt-2 text-[13px] font-medium text-ink">Ver conexión</p>
      </div>
    </Link>
  );
}
