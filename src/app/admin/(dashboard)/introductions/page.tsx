"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { AdminEmpty, AdminError, AdminLoading } from "@/components/admin/States";
import Badge from "@/components/admin/Badge";
import PhotoThumb from "@/components/admin/PhotoThumb";

interface IntroductionRow {
  id: string;
  personA: { uid: string | null; firstName: string; photoPath: string | null };
  personB: { uid: string | null; firstName: string; photoPath: string | null };
  originalScore: number | null;
  selectedAt: string | null;
  mutualAt: string | null;
  introducedAt: string | null;
  contactRevealedAt: string | null;
  source: string;
}

function fmt(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export default function IntroductionsPage() {
  const [items, setItems] = useState<IntroductionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetchJson<{ items: IntroductionRow[] }>("/api/admin/dashboard/introductions")
      .then((res) => setItems(res.items))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="max-w-5xl">
      <h1 className="font-serif text-[26px] text-ink">Introducciones</h1>
      <p className="mt-2 text-[14px] text-ink-soft">Parejas donde ambas personas dijeron que sí.</p>

      <div className="mt-6">
        {error && <AdminError message={error} />}
        {!error && !items && <AdminLoading />}
        {!error && items && items.length === 0 && <AdminEmpty message="Todavía no hay introducciones mutuas." />}
        {!error && items && items.length > 0 && (
          <div className="space-y-2">
            {items.map((intro) => (
              <Link
                key={intro.id}
                href={`/admin/proposals/${intro.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-white px-4 py-3 hover:border-rose"
              >
                <div className="flex items-center gap-3">
                  <PhotoThumb path={intro.personA.photoPath} alt={intro.personA.firstName} size={32} />
                  <span className="text-[14px] text-ink">{intro.personA.firstName}</span>
                  <span className="text-ink-soft">×</span>
                  <PhotoThumb path={intro.personB.photoPath} alt={intro.personB.firstName} size={32} />
                  <span className="text-[14px] text-ink">{intro.personB.firstName}</span>
                </div>
                <div className="flex items-center gap-4 text-[12px] text-ink-soft">
                  {intro.source === "admin_manual" && <Badge tone="neutral">Sugerencia del equipo</Badge>}
                  <span>Puntuación original: {intro.originalScore ?? "—"}</span>
                  <span>Introducida: {fmt(intro.introducedAt)}</span>
                  <Badge tone={intro.contactRevealedAt ? "positive" : "muted"}>
                    {intro.contactRevealedAt ? "Contacto revelado" : "Sin revelar contacto"}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
