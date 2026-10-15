"use client";

import { useEffect } from "react";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import type { CandidateDetail } from "@/lib/clients/candidateDetail";
import {
  activityLabel,
  distanceLabel,
  educationLabel,
  frequencyLabel,
  futureChildrenIntentionLabel,
  genderLabel,
  hardFilterFailureLabel,
  hasYoungChildrenLabel,
  languageList,
  relationshipIntentionLabel,
  youngChildrenMattersLabel,
} from "@/lib/admin/labels";
import WhyBreakdown from "@/components/admin/WhyBreakdown";
import PhotoThumb from "@/components/admin/PhotoThumb";
import { AdminError, AdminLoading } from "@/components/admin/States";
import { SHORTLIST_STATUSES, type ShortlistStatus } from "@/lib/clients/types";
import Reciprocity from "./Reciprocity";
import { errorText, formatDate, pillButton, primaryPill } from "./ui";

/**
 * One candidate, in full, next to the client's page: photos, everything
 * they answered (except income and birth date), their approved
 * presentation, how to reach them, what they are looking for themselves,
 * and the detailed score. Opening it changes nothing and notifies nobody.
 */
export default function CandidatePanel({
  clientId,
  clientName,
  uid,
  shortlistStatus,
  onShortlist,
  onClose,
}: {
  clientId: string;
  clientName: string;
  uid: string;
  shortlistStatus: ShortlistStatus | null;
  onShortlist: (uid: string, score: number | null) => Promise<void>;
  onClose: () => void;
}) {
  const { data, error } = useAdminQuery(
    () => adminFetchJson<{ candidate: CandidateDetail }>(`/api/admin/clients/${clientId}/candidates/${uid}`),
    [clientId, uid],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const c = data?.candidate;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Perfil del candidato"
        className="h-full w-full max-w-[640px] overflow-y-auto bg-paper shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hairline bg-paper/95 px-6 py-4 backdrop-blur">
          <button type="button" onClick={onClose} className="text-[13px] font-medium text-ink-soft hover:text-ink">
            ← Volver a la lista
          </button>
          {c &&
            (shortlistStatus ? (
              <span className="text-[13px] text-ink-soft">
                En la preselección · {SHORTLIST_STATUSES.find((s) => s.value === shortlistStatus)?.label}
              </span>
            ) : (
              <button type="button" className={primaryPill} onClick={() => void onShortlist(uid, c.why?.score ?? null)}>
                Preseleccionar
              </button>
            ))}
        </div>

        <div className="space-y-6 px-6 py-6">
          {error && <AdminError message={errorText(error) ?? undefined} />}
          {!error && !c && <AdminLoading />}
          {c && (
            <>
              <header>
                <h2 className="font-serif text-[30px] leading-tight text-ink">
                  {c.firstName}
                  {c.age !== null && <span className="text-ink-soft">, {c.age}</span>}
                </h2>
                <p className="mt-1 text-[14px] text-ink-soft">
                  {c.place ? `${c.place.name} · ${c.place.province}` : c.city || "Ciudad no indicada"}
                  {c.distanceKm !== null && ` · a ${c.distanceKm} km`}
                </p>
                <p className="mt-1 text-[12px] text-ink-soft">
                  Perfil completo y activo · actualizado {formatDate(c.updatedAt)}
                  {c.membership && " · tuvo Membresía"}
                </p>
                <div className="mt-3">
                  <Reciprocity
                    clientName={clientName}
                    candidateName={c.firstName}
                    clientAccepts={!c.failures.some((f) => f.direction === "a_rejects_b")}
                    candidateAccepts={!c.failures.some((f) => f.direction === "b_rejects_a")}
                  />
                </div>
              </header>

              {c.photos.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {c.photos.map((path, i) => (
                    <a
                      key={path}
                      href={`/api/admin/dashboard/photo?path=${encodeURIComponent(path)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <PhotoThumb path={path} alt={`${c.firstName}, foto ${i + 1}`} size={190} rounded="lg" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-ink-soft">Sin fotos.</p>
              )}

              {c.failures.length > 0 && (
                <section className="rounded-xl border border-[#e8c9c5] bg-[#f5e2e0]/50 p-4">
                  <h3 className="text-[14px] font-medium text-[#8a3b3b]">No es compatible</h3>
                  <ul className="mt-2 space-y-1 text-[13px] text-ink">
                    {c.failures.map((f, i) => (
                      <li key={i}>{hardFilterFailureLabel(f, clientName, c.firstName)}</li>
                    ))}
                  </ul>
                </section>
              )}

              {c.why && <WhyBreakdown why={c.why} />}

              {c.presentation && (
                <Section title="Presentación aprobada">
                  <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{c.presentation}</p>
                </Section>
              )}

              <Section title="Sobre esta persona">
                <Facts
                  rows={[
                    ["Género", genderLabel(c.visible.gender)],
                    ["Profesión", c.visible.profession || "—"],
                    ["Formación", educationLabel(c.visible.educationLevel)],
                    ["Altura", c.visible.heightCm ? `${c.visible.heightCm} cm` : "—"],
                    ["Idiomas", languageList(c.visible.languages) || "—"],
                    ["Hijos", c.visible.hasChildren === null ? "—" : c.visible.hasChildren ? `Sí · ${hasYoungChildrenLabel(c.visible.hasYoungChildren)}` : "No"],
                    ["Quiere hijos", futureChildrenIntentionLabel(c.visible.wantsFutureChildren)],
                    ["Busca", relationshipIntentionLabel(c.visible.relationshipIntention)],
                    ["Fuma", frequencyLabel(c.visible.smoking)],
                    ["Alcohol", frequencyLabel(c.visible.drinking)],
                    ["Actividad física", activityLabel(c.visible.activityLevel)],
                  ]}
                />
              </Section>

              <Section title="Lo que busca">
                <Facts
                  rows={[
                    ["Género", c.lookingFor.gendersSought.map(genderLabel).join(", ") || "—"],
                    ["Edad", c.lookingFor.ageMin || c.lookingFor.ageMax ? `${c.lookingFor.ageMin ?? "—"} a ${c.lookingFor.ageMax ?? "—"} años` : "—"],
                    ["Distancia", distanceLabel(c.lookingFor.maxDistance)],
                    ["Tipo de relación", c.lookingFor.relationshipIntentionsAccepted.map(relationshipIntentionLabel).join(", ") || "—"],
                    ["Acepta que fume", c.lookingFor.smokingAccepted.map(frequencyLabel).join(", ") || "—"],
                    ["Hijos menores de 15", youngChildrenMattersLabel(c.lookingFor.partnerYoungChildrenMatters)],
                    ["Altura", c.lookingFor.heightMinCm || c.lookingFor.heightMaxCm ? `${c.lookingFor.heightMinCm ?? "—"} a ${c.lookingFor.heightMaxCm ?? "—"} cm` : "—"],
                    ["Alcohol", c.lookingFor.drinkingAccepted.map(frequencyLabel).join(", ") || "—"],
                    ["Actividad física", c.lookingFor.activityLevelsPreferred.map(activityLabel).join(", ") || "—"],
                  ]}
                />
              </Section>

              <Section title="Contacto">
                <Facts
                  rows={[
                    ["Email", c.contact.email ?? "—"],
                    ["Teléfono", c.contact.phone ?? "—"],
                    ["Instagram", c.contact.instagram ?? "—"],
                    ["LinkedIn", c.contact.linkedin ?? "—"],
                    ["Prefiere", c.contact.preferredMethod ?? "—"],
                  ]}
                />
                <p className="mt-3 text-[12px] text-ink-soft">Solo para el equipo. Desde aquí no se envía nada.</p>
              </Section>

              {!shortlistStatus && (
                <div className="pb-4">
                  <button type="button" className={pillButton} onClick={() => void onShortlist(uid, c.why?.score ?? null)}>
                    Preseleccionar a {c.firstName}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.1em] text-ink-soft">{title}</h3>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-hairline/70 rounded-xl border border-hairline bg-white">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 px-4 py-2.5 text-[14px]">
          <dt className="text-ink-soft">{k}</dt>
          <dd className="text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
