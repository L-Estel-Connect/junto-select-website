"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { updateProfileFields } from "@/lib/introduction/profile";
import { useSharedProfile } from "@/lib/introduction/profileCache";
import {
  isAboutMeComplete,
  isPhotosComplete,
  isPreferencesComplete,
  isPresentationComplete,
} from "@/lib/introduction/completion";
import { getAge } from "@/lib/introduction/age";
import {
  activityLabel,
  educationLabel,
  frequencyLabel,
  genderLabel,
  languageList,
  relationshipIntentionLabel,
} from "@/lib/admin/labels";
import { PROGRAMMES } from "@/lib/site/matchmaking";
import { memberFetchJson } from "@/lib/member/memberFetch";
import { useMemberQuery } from "@/lib/member/useMemberQuery";
import type { ActiveReconnectEventView } from "@/lib/eventReconnect/types";
import type { ProfileDocument } from "@/lib/introduction/types";
import { primaryButtonClasses } from "@/lib/styles";
import PrivatePhotoThumbnail from "@/components/introduction/PrivatePhotoThumbnail";
import { DeleteProfileModal } from "./SettingsSection";

/**
 * The private profile, as its owner sees it: one calm page with what the
 * team takes into account, a way to edit each part (the existing
 * questionnaire pages), a discreet way to ask for a programme, a switch to
 * stop being presented, and deletion. No proposals, inbox, membership,
 * browsing or payments.
 */

const linkClasses = "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

const SEEK_LABELS: Record<string, string> = { mujer: "Una mujer", hombre: "Un hombre" };
const DISTANCE_LABELS: Record<string, string> = {
  misma_ciudad: "Misma ciudad (hasta 20 km)",
  hasta_50km: "Hasta 50 km",
  sin_limite: "Sin límite, en toda España",
};

function ageOf(profile: ProfileDocument): number | null {
  const bd = profile.private.birthDate;
  return bd ? getAge(bd.toDate().toISOString().slice(0, 10)) : null;
}

function birthDateLabel(profile: ProfileDocument): string {
  const bd = profile.private.birthDate;
  return bd ? bd.toDate().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—";
}

function childrenLabel(v: ProfileDocument["visible"]): string {
  if (v.hasChildren === null) return "—";
  if (!v.hasChildren) return "No";
  return v.hasYoungChildren ? "Sí, alguno menor de 15 años" : "Sí, todos de 15 años o más";
}

const CONTACT_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  telefono: "Teléfono",
  email: "Email",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

export default function PrivateProfileView({ uid, email, notice }: { uid: string; email: string | null; notice?: ReactNode }) {
  const { profile, mutate } = useSharedProfile(uid);
  const reconnectQuery = useMemberQuery(
    () => memberFetchJson<{ event: ActiveReconnectEventView | null }>("/api/member/reconnect/active"),
    [uid],
  );
  const [programme, setProgramme] = useState<"select" | "privado">("select");
  const [pausing, setPausing] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  if (!profile) return null;
  const v = profile.visible;
  const d = profile.dealbreakers;
  const age = ageOf(profile);
  const paused = profile.meta.presentationsPaused === true;
  const presentedWord = v.gender === "hombre" ? "presentado" : v.gender === "mujer" ? "presentada" : "presentado/a";

  const missing: { label: string; href: string }[] = [];
  if (!isAboutMeComplete(profile)) missing.push({ label: "Sobre ti", href: "/member/profile/about" });
  if (!isPhotosComplete(profile.photos)) missing.push({ label: "tus fotos", href: "/member/profile/photos" });
  if (!isPreferencesComplete(d)) missing.push({ label: "Lo que buscas", href: "/member/profile/preferences" });
  if (!isPresentationComplete(profile.presentation.status)) missing.push({ label: "tu presentación", href: "/member/profile/presentation" });

  async function togglePause() {
    setPauseError(null);
    setPausing(true);
    const next = !paused;
    try {
      await updateProfileFields(uid, {}, { presentationsPaused: next });
      mutate((prev) => ({ ...prev, meta: { ...prev.meta, presentationsPaused: next } }));
    } catch {
      setPauseError("No hemos podido guardar el cambio. Inténtalo de nuevo.");
    } finally {
      setPausing(false);
    }
  }

  const reconnect = reconnectQuery.data?.event ?? null;
  const presentationText = profile.presentation.approvedText || profile.presentation.generatedText || "";

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col py-12 sm:py-14">
      {/* Overview */}
      <header className="flex items-center gap-5">
        {profile.photos[0] && (
          <div className="w-[84px] shrink-0 overflow-hidden rounded-full sm:w-[96px]">
            <PrivatePhotoThumbnail path={profile.photos[0]} />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-ink-soft">Tu perfil privado</p>
          <h1 className="mt-1 font-serif text-[32px] font-light leading-[1.1] text-ink sm:text-[40px]">{v.firstName || "Tu perfil"}</h1>
          <p className="mt-1 text-[14px] text-ink-soft">{[age ? `${age} años` : null, v.city].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      <div className="mt-6 space-y-2 text-[15px] leading-relaxed text-ink-soft">
        <p>
          {paused ? (
            <>Has pedido no ser {presentedWord} por ahora. Tu perfil se conserva y puedes volver cuando quieras.</>
          ) : missing.length === 0 ? (
            <>Tu perfil forma parte de nuestra red privada.</>
          ) : (
            <>
              Para terminar tu perfil, completa{" "}
              <Link href={missing[0].href} className={linkClasses}>
                {missing.map((m) => m.label).join(", ")}
              </Link>
              .
            </>
          )}
        </p>
        <p>
          <span className="text-ink">Quién lo ve.</span> Tu perfil no se publica y nadie puede buscarlo. Lo ve nuestro
          equipo y, si encontramos a alguien compatible entre nuestros clientes, se lo presentamos en privado. Si le
          interesas, te preguntamos antes de nada. Nunca compartimos tu teléfono ni tu email sin tu acuerdo.
        </p>
      </div>

      {notice}

      {reconnect && (
        <div className="mt-8 rounded-md border border-hairline bg-white/60 p-5">
          <p className="text-[15px] font-medium text-ink">Reconnect · {reconnect.eventLabel}</p>
          <p className="mt-1 text-[14px] text-ink-soft">¿Conociste a alguien que te gustaría volver a ver?</p>
          <Link href={`/reconnect/${reconnect.eventId}`} className={`mt-3 inline-block text-sm ${linkClasses}`}>
            Abrir Reconnect
          </Link>
        </div>
      )}

      {/* Profile sections */}
      <section className="mt-12" aria-labelledby="tu-perfil">
        <h2 id="tu-perfil" className="font-serif text-[24px] font-light text-ink">
          Tu perfil
        </h2>
        <p className="mt-1 text-[14px] text-ink-soft">
          Lo que nuestro equipo tiene en cuenta al buscar compatibilidades. Puedes cambiarlo cuando quieras.
        </p>

        <Card title="Datos personales" href="/member/profile/about">
          <Rows
            rows={[
              ["Nombre", v.firstName || "—"],
              ["Soy", genderLabel(v.gender)],
              ["Fecha de nacimiento", birthDateLabel(profile)],
              ["Ciudad", v.city || "—"],
              ["Profesión", v.profession || "—"],
            ]}
          />
        </Card>

        <Card title="Fotos" href="/member/profile/photos">
          {profile.photos.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {profile.photos.map((path, i) => (
                <PrivatePhotoThumbnail key={path} path={path} primary={i === 0} />
              ))}
            </div>
          ) : (
            <p className="text-[14px] text-ink-soft">Aún no has añadido fotos.</p>
          )}
          <p className="mt-3 text-[13px] text-ink-soft">Tus fotos son privadas: solo las ve nuestro equipo y, en privado, los clientes a los que te presentemos.</p>
        </Card>

        <Card title="Sobre ti" href="/member/profile/about">
          <Rows
            rows={[
              ["Formación", educationLabel(v.educationLevel)],
              ["Altura", v.heightCm ? `${v.heightCm} cm` : "—"],
              ["Idiomas", languageList(v.languages) || "—"],
              ["Hijos", childrenLabel(v)],
              ["Relación que buscas", relationshipIntentionLabel(v.relationshipIntention)],
              [
                "Estilo de vida",
                [
                  v.smoking ? `Fuma: ${frequencyLabel(v.smoking).toLowerCase()}` : null,
                  v.drinking ? `Alcohol: ${frequencyLabel(v.drinking).toLowerCase()}` : null,
                  v.activityLevel ? `Actividad: ${activityLabel(v.activityLevel).toLowerCase()}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—",
              ],
            ]}
          />
        </Card>

        <Card title="Lo que buscas" href="/member/profile/preferences">
          <Rows
            rows={[
              ["Busco", d.gendersSought.map((g) => SEEK_LABELS[g] ?? genderLabel(g)).join(" o ") || "—"],
              ["Edad", d.ageMin || d.ageMax ? `De ${d.ageMin ?? "—"} a ${d.ageMax ?? "—"} años` : "—"],
              ["Distancia", d.maxDistance ? DISTANCE_LABELS[d.maxDistance] ?? d.maxDistance : "—"],
              ["Tipo de relación", d.relationshipIntentionsAccepted.map(relationshipIntentionLabel).join(", ") || "—"],
              ["Tabaco", d.smokingAccepted.length ? `Acepto: ${d.smokingAccepted.map((f) => frequencyLabel(f).toLowerCase()).join(", ")}` : "—"],
              [
                "Hijos menores de 15",
                d.partnerYoungChildrenMatters === null ? "—" : d.partnerYoungChildrenMatters ? "Me importaría" : "No me importaría",
              ],
            ]}
          />
        </Card>

        <Card title="Tu presentación" href="/member/profile/presentation">
          {presentationText ? (
            <p className="whitespace-pre-line font-serif text-[17px] font-light italic leading-relaxed text-ink">«{presentationText}»</p>
          ) : (
            <p className="text-[14px] text-ink-soft">Aún no has escrito tu presentación.</p>
          )}
          <p className="mt-3 text-[13px] text-ink-soft">Te ayudamos a pulirla antes de presentarte a nadie.</p>
        </Card>

        <Card title="Contacto" href="/member/profile/contact">
          <Rows
            rows={[
              ["Email", email ?? "—"],
              ["Teléfono", profile.contactPreferences.phone || "—"],
              [
                "Prefiero que me contactéis por",
                profile.contactPreferences.preferredMethod ? CONTACT_LABELS[profile.contactPreferences.preferredMethod] : "—",
              ],
            ]}
          />
          <p className="mt-3 text-[13px] text-ink-soft">Solo para que nuestro equipo hable contigo. No lo compartimos con nadie sin tu acuerdo.</p>
        </Card>
      </section>

      {/* Programmes */}
      <section className="mt-14 rounded-md border border-[var(--laton,#cdbfad)] bg-white/60 p-6 sm:p-8" aria-labelledby="busquemos">
        <h2 id="busquemos" className="font-serif text-[26px] font-light leading-snug text-ink">
          ¿Quieres que busquemos por ti?
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          Tu perfil forma parte de nuestra red privada: te tenemos en cuenta cuando buscamos para nuestros clientes. Con
          un programa, la búsqueda empieza por ti. Una persona de nuestro equipo conoce tu caso, busca activamente y te
          presenta solo a quien encaja contigo.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Programa">
          {PROGRAMMES.map((p) => (
            <label
              key={p.key}
              className={`cursor-pointer rounded-md border p-4 transition-colors ${
                programme === p.key ? "border-ink bg-white" : "border-hairline hover:border-ink/40"
              }`}
            >
              <input
                type="radio"
                name="programa"
                className="sr-only"
                checked={programme === p.key}
                onChange={() => setProgramme(p.key)}
              />
              <span className="block text-[15px] font-medium text-ink">
                {p.name} · {p.priceLabel}
              </span>
              <span className="mt-1 block text-[13px] leading-relaxed text-ink-soft">
                Seis meses · {p.key === "select" ? "Búsqueda local · Hasta tres propuestas cualificadas" : "Búsqueda nacional · Hasta seis propuestas cualificadas"}
              </span>
            </label>
          ))}
        </div>
        <Link href={`/matchmaking?programa=${programme}&desde=perfil#entrevista`} className={`${primaryButtonClasses} mt-6 w-full sm:w-auto`}>
          Solicitar una consulta privada
        </Link>
        <p className="mt-3 text-[13px] text-ink-soft">Hablamos contigo antes de cualquier compromiso. Sin pago online.</p>
      </section>

      {/* Pause + delete */}
      <section className="mt-14 border-t border-hairline pt-8" aria-label="Tu cuenta">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[15px] font-medium text-ink">Dejar de ser {presentedWord}</p>
            <p className="mt-1 max-w-[46ch] text-[14px] leading-relaxed text-ink-soft">
              Mientras esté activado, no te tendremos en cuenta en ninguna búsqueda. Tu perfil se conserva y puedes
              volver cuando quieras.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={paused}
            aria-label={`Dejar de ser ${presentedWord}`}
            disabled={pausing}
            onClick={() => void togglePause()}
            className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${paused ? "bg-ink" : "bg-hairline"}`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${paused ? "left-6" : "left-1"}`}
            />
          </button>
        </div>
        <p className="mt-2 text-[13px] text-ink-soft" role="status">
          {paused ? "En pausa" : "Disponible"}
        </p>
        {pauseError && (
          <p role="alert" className="mt-2 text-[13px] text-[#8a3b3b]">
            {pauseError}
          </p>
        )}

        <div className="mt-8 flex items-start justify-between gap-6 border-t border-hairline pt-8">
          <div>
            <p className="text-[15px] font-medium text-ink">Eliminar mi perfil</p>
            <p className="mt-1 max-w-[46ch] text-[14px] leading-relaxed text-ink-soft">
              Borraremos de forma permanente tu perfil, tus fotos y tu acceso. No se puede deshacer.
            </p>
          </div>
          <button type="button" onClick={() => setShowDelete(true)} className={`mt-1 shrink-0 text-[14px] ${linkClasses}`}>
            Eliminar mi perfil
          </button>
        </div>
      </section>

      {showDelete && (
        <DeleteProfileModal
          onClose={() => setShowDelete(false)}
          onDeleted={() => {
            // Same as Ajustes: a full navigation; the confirmation page signs out.
            window.location.replace("/perfil-eliminado");
          }}
        />
      )}
    </div>
  );
}

function Card({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <div className="mt-5 rounded-md border border-hairline bg-white/60 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.16em] text-ink-soft">{title}</h3>
        <Link href={href} className={`text-[13px] ${linkClasses}`}>
          Editar<span className="sr-only"> {title}</span>
        </Link>
      </div>
      {children}
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-hairline/70">
      {rows.map(([k, val]) => (
        <div key={k} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-3 py-2 text-[14px] sm:grid-cols-[180px_minmax(0,1fr)]">
          <dt className="text-ink-soft">{k}</dt>
          <dd className="text-ink">{val}</dd>
        </div>
      ))}
    </dl>
  );
}
