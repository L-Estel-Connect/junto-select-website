"use client";

import { use, useState } from "react";
import Link from "next/link";
import { adminFetchJson } from "@/lib/admin/adminFetch";
import { useAdminQuery } from "@/lib/admin/useAdminQuery";
import { AdminError, AdminLoading } from "@/components/admin/States";
import Badge from "@/components/admin/Badge";
import PhotoThumb from "@/components/admin/PhotoThumb";
import MemberSuggestPanel from "@/components/admin/MemberSuggestPanel";
import {
  activityLabel,
  distanceLabel,
  educationLabel,
  frequencyLabel,
  futureChildrenIntentionLabel,
  futureChildrenPreferenceLabel,
  genderLabel,
  languageList,
  relationshipIntentionLabel,
  HARD_FILTER_REASON_LABELS,
  PAIR_HISTORY_REASON_LABELS,
} from "@/lib/admin/labels";
import type { MemberDetail } from "@/lib/admin/memberDetail";
import { PLAN_DISPLAY } from "@/lib/billing/plans";

const BILLING_STATUS_LABELS: Record<string, string> = {
  none: "Sin membresía",
  active: "Activa",
  trialing: "En prueba",
  past_due: "Pago pendiente (reintentando)",
  canceled: "Cancelada",
  incomplete: "Pago incompleto",
  incomplete_expired: "Pago incompleto (expirado)",
  unpaid: "Impagada",
};

function adminFormatDate(value: unknown): string {
  const ts = value as { toDate?: () => Date } | null | undefined;
  const date = ts?.toDate ? ts.toDate() : null;
  return date ? date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "—";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-ink-soft">{label}</p>
      <p className="mt-0.5 text-[14px] text-ink">{value || "No especificado"}</p>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">{children}</h2>;
}

export default function MemberDetailPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = use(params);
  const [showSuggest, setShowSuggest] = useState(false);

  const { data, error, reload } = useAdminQuery(
    () => adminFetchJson<{ member: MemberDetail }>(`/api/admin/dashboard/members/${uid}`),
    [uid],
  );
  const member = data?.member ?? null;

  if (error) return <AdminError message={error} />;
  if (!member) return <AdminLoading />;

  const { profile, interactions, currentCycle } = member;

  return (
    <div className="max-w-4xl pb-16">
      <Link href="/admin/members" className="text-[13px] text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink">
        ← Miembros
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <PhotoThumb path={profile.photos[0] ?? null} alt={profile.firstName} size={72} rounded="lg" />
          <div>
            <h1 className="font-serif text-[24px] text-ink">
              {profile.firstName} {profile.age ? `· ${profile.age} años` : ""}
            </h1>
            <p className="mt-1 text-[14px] text-ink-soft">
              {genderLabel(profile.gender)} · {profile.city || "Ciudad no especificada"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={profile.searchStatus === "active_search" ? "positive" : "muted"}>
                {profile.searchStatus === "active_search" ? "Búsqueda activa" : "Pasivo/a"}
              </Badge>
              <Badge tone={profile.eligibleForMatching ? "positive" : "muted"}>
                {profile.eligibleForMatching ? "Elegible" : "No elegible"}
              </Badge>
              <Badge tone={profile.profileStatus === "active_for_matching" ? "positive" : "warning"}>
                {profile.profileStatus === "active_for_matching" ? "Perfil completo" : "Perfil incompleto"}
              </Badge>
              {profile.duplicateStatus === "confirmed_duplicate" && <Badge tone="negative">Duplicado confirmado</Badge>}
              {currentCycle && currentCycle.proposalCount !== null && (
                <Badge tone="neutral">{currentCycle.proposalCount} selecciones este ciclo</Badge>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowSuggest(true)}
          className="shrink-0 rounded-full border border-ink px-4 py-2 text-[13px] font-medium text-ink hover:bg-ink hover:text-white"
        >
          Sugerir alguien
        </button>
      </div>

      {/* Membresía — read-only mirror of Stripe, never editable here */}
      <section className="mt-10">
        <SectionHeading>Membresía</SectionHeading>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-hairline bg-white p-5 sm:grid-cols-3">
          <Field
            label="Estado"
            value={member.billing ? (BILLING_STATUS_LABELS[member.billing.status] ?? member.billing.status) : "Sin membresía"}
          />
          <Field label="Plan" value={member.billing?.planKey ? PLAN_DISPLAY[member.billing.planKey].label : ""} />
          <Field
            label={member.billing?.cancelAtPeriodEnd ? "Finaliza el" : "Próxima renovación"}
            value={member.billing?.currentPeriodEnd ? adminFormatDate(member.billing.currentPeriodEnd) : ""}
          />
        </div>
        {member.billing?.status === "past_due" && (
          <p className="mt-2 text-[13px] text-[#8a3b3b]">
            Último cobro fallido — Stripe está reintentando automáticamente.
          </p>
        )}
        <p className="mt-2 text-[12px] text-ink-soft">
          Stripe es la fuente de la verdad. Esta vista es solo de lectura — cualquier cambio de plan,
          cancelación o reembolso se gestiona en el Stripe Dashboard, nunca desde aquí.
        </p>
      </section>

      {/* A. Perfil */}
      <section className="mt-10">
        <SectionHeading>Perfil</SectionHeading>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-hairline bg-white p-5 sm:grid-cols-3">
          <Field label="Profesión" value={profile.profession} />
          <Field label="Formación" value={educationLabel(profile.educationLevel)} />
          <Field label="Altura" value={profile.heightCm ? `${profile.heightCm} cm` : ""} />
          <Field label="Idiomas" value={languageList(profile.languages)} />
          <Field
            label="Hijos"
            value={
              profile.hasChildren === null
                ? ""
                : profile.hasChildren
                  ? `Sí (${profile.childrenBirthYears?.length ?? profile.childrenCount ?? "?"})`
                  : "No"
            }
          />
          <Field label="¿Quiere hijos en el futuro?" value={futureChildrenIntentionLabel(profile.wantsFutureChildren)} />
          <Field label="Busca" value={relationshipIntentionLabel(profile.relationshipIntention)} />
          <Field label="Fuma" value={frequencyLabel(profile.smoking)} />
          <Field label="Bebe" value={frequencyLabel(profile.drinking)} />
          <Field label="Actividad física" value={activityLabel(profile.activityLevel)} />
        </div>
        {profile.presentation.approvedText && (
          <p className="mt-3 rounded-xl border border-hairline bg-white p-5 text-[14px] leading-relaxed text-ink">
            {profile.presentation.approvedText}
          </p>
        )}
      </section>

      {/* B. Criterios privados de match */}
      <section className="mt-10">
        <SectionHeading>Lo que busca (criterios privados)</SectionHeading>
        <p className="mt-2 text-[13px] text-ink-soft">
          Requisitos imprescindibles a la izquierda, preferencias que solo afectan a la puntuación a la derecha.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-hairline bg-white p-5">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-soft">Imprescindible</p>
            <div className="mt-3 space-y-3">
              <Field label="Género buscado" value={profile.dealbreakers.gendersSought.map(genderLabel).join(", ")} />
              <Field
                label="Rango de edad"
                value={
                  profile.dealbreakers.ageMin && profile.dealbreakers.ageMax
                    ? `${profile.dealbreakers.ageMin}–${profile.dealbreakers.ageMax}`
                    : ""
                }
              />
              <Field label="Distancia" value={distanceLabel(profile.dealbreakers.maxDistance)} />
              <Field
                label="Tipo de relación aceptado"
                value={profile.dealbreakers.relationshipIntentionsAccepted.map(relationshipIntentionLabel).join(", ")}
              />
              <Field label="Fumador aceptado" value={profile.dealbreakers.smokingAccepted.map(frequencyLabel).join(", ")} />
              <Field
                label="¿Acepta pareja con hijos?"
                value={profile.dealbreakers.partnerHasChildrenOk === null ? "" : profile.dealbreakers.partnerHasChildrenOk ? "Sí" : "No"}
              />
              <Field
                label="¿Acepta hijos menores de 15?"
                value={
                  profile.dealbreakers.partnerHasYoungChildrenOk === null
                    ? ""
                    : profile.dealbreakers.partnerHasYoungChildrenOk
                      ? "Sí"
                      : "No"
                }
              />
              <Field
                label="¿Debe querer hijos futuros?"
                value={futureChildrenPreferenceLabel(profile.dealbreakers.partnerWantsFutureChildren)}
              />
            </div>
          </div>
          <div className="rounded-xl border border-hairline bg-white p-5">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-soft">Preferencias (no excluyentes)</p>
            <div className="mt-3 space-y-3">
              <Field
                label="Altura preferida"
                value={
                  profile.preferences.heightMinCm || profile.preferences.heightMaxCm
                    ? `${profile.preferences.heightMinCm ?? "—"}–${profile.preferences.heightMaxCm ?? "—"} cm`
                    : ""
                }
              />
              <Field label="Alcohol aceptado" value={profile.preferences.drinkingAccepted.map(frequencyLabel).join(", ")} />
              <Field label="Actividad preferida" value={profile.preferences.activityLevelsPreferred.map(activityLabel).join(", ")} />
            </div>
          </div>
        </div>
      </section>

      {/* D. Ciclo actual */}
      {currentCycle && (
        <section className="mt-10">
          <SectionHeading>Ciclo actual ({currentCycle.cycleId})</SectionHeading>
          <div className="mt-3 rounded-xl border border-hairline bg-white p-5">
            <p className="text-[14px] text-ink">
              Estado de la ejecución:{" "}
              <span className="font-medium">
                {currentCycle.status === "not_processed"
                  ? "Aún no procesado"
                  : currentCycle.status === "completed"
                    ? "Completado"
                    : currentCycle.status === "claimed"
                      ? "En curso"
                      : "Fallido"}
              </span>
            </p>
            {currentCycle.error && <p className="mt-1 text-[13px] text-[#8a3b3b]">Error: {currentCycle.error}</p>}
            {currentCycle.diagnostics && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[13px] text-ink">Bolsa de candidatos: {currentCycle.diagnostics.candidatePoolSize}</p>
                  <p className="text-[13px] text-ink">Pasaron los requisitos imprescindibles: {currentCycle.diagnostics.hardFilterSurvivors}</p>
                  <p className="text-[13px] text-ink">Superaron el umbral de calidad: {currentCycle.diagnostics.aboveQualityThreshold}</p>
                  <p className="text-[13px] text-ink">
                    Puntuación más alta encontrada: {currentCycle.diagnostics.highestScore ?? "—"}
                  </p>
                </div>
                <div>
                  {Object.keys(currentCycle.diagnostics.hardFilterExcluded).length > 0 && (
                    <>
                      <p className="text-[12px] font-medium text-ink-soft">Excluidos por requisito imprescindible:</p>
                      <ul className="mt-1 text-[13px] text-ink-soft">
                        {Object.entries(currentCycle.diagnostics.hardFilterExcluded).map(([reason, count]) => (
                          <li key={reason}>
                            {HARD_FILTER_REASON_LABELS[reason] ?? reason}: {count}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {Object.keys(currentCycle.diagnostics.pairHistoryExcluded).length > 0 && (
                    <>
                      <p className="mt-2 text-[12px] font-medium text-ink-soft">Excluidos por historial de la pareja:</p>
                      <ul className="mt-1 text-[13px] text-ink-soft">
                        {Object.entries(currentCycle.diagnostics.pairHistoryExcluded).map(([reason, count]) => (
                          <li key={reason}>
                            {PAIR_HISTORY_REASON_LABELS[reason] ?? reason}: {count}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* C. Historial de matching */}
      <section className="mt-10">
        <SectionHeading>Historial de matching</SectionHeading>
        {interactions.length === 0 ? (
          <p className="mt-3 text-[14px] text-ink-soft">Todavía no ha tenido ninguna selección.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {interactions.map((i) => (
              <Link
                key={i.proposalId}
                href={`/admin/proposals/${i.proposalId}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-white px-4 py-3 hover:border-rose"
              >
                <div className="flex items-center gap-3">
                  <PhotoThumb path={i.otherPhotoPath} alt={i.otherFirstName} size={36} />
                  <div>
                    <p className="text-[14px] text-ink">
                      {i.otherFirstName}{" "}
                      <span className="text-ink-soft">
                        · {i.role === "recipient" ? "seleccionado/a para ella/él" : "ella/él fue seleccionado/a"}
                      </span>
                    </p>
                    <p className="text-[12px] text-ink-soft">
                      {i.monthLabel} · {i.status}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {i.source === "admin_manual" && <Badge tone="neutral">Sugerencia del equipo</Badge>}
                  {i.hasIntroduction && <Badge tone="positive">Introducción</Badge>}
                  <Badge tone="muted">{i.score}/100</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {showSuggest && (
        <MemberSuggestPanel
          recipientUid={uid}
          recipientName={profile.firstName}
          onClose={() => setShowSuggest(false)}
          onCreated={() => {
            setShowSuggest(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
