"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch, adminFetchJson } from "@/lib/admin/adminFetch";
import { AdminEmpty, AdminError, AdminLoading } from "@/components/admin/States";
import Badge from "@/components/admin/Badge";
import PhotoThumb from "@/components/admin/PhotoThumb";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import PersonPicker from "@/components/admin/PersonPicker";

interface PersonBrief {
  uid: string | null;
  firstName: string;
  photoPath: string | null;
  city: string;
}

interface DuplicateRow {
  id: string;
  uidLow: string;
  uidHigh: string;
  score: number;
  signals: string[];
  status: string;
  profileLow: PersonBrief;
  profileHigh: PersonBrief;
}

interface BlockedRow {
  personIdLow: string;
  personIdHigh: string;
  reason: string | null;
  personLow: PersonBrief;
  personHigh: PersonBrief;
}

const SIGNAL_LABELS: Record<string, string> = {
  phone_exact: "mismo teléfono",
  email_exact: "mismo email",
  instagram_exact: "mismo Instagram",
  linkedin_exact: "mismo LinkedIn",
  photo_hash_exact: "misma foto exacta",
};

export default function ReviewPage() {
  const [duplicates, setDuplicates] = useState<DuplicateRow[] | null>(null);
  const [blocked, setBlocked] = useState<BlockedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<{ candidateId: string; primaryUid: string; secondaryUid: string; label: string } | null>(null);
  const [personA, setPersonA] = useState<{ uid: string; firstName: string; city: string; photoPath: string | null } | null>(null);
  const [personB, setPersonB] = useState<{ uid: string; firstName: string; city: string; photoPath: string | null } | null>(null);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  function load() {
    adminFetchJson<{ duplicates: DuplicateRow[]; blocked: BlockedRow[] }>("/api/admin/dashboard/review")
      .then((res) => {
        setDuplicates(res.duplicates);
        setBlocked(res.blocked);
      })
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleDismiss(candidateId: string) {
    await adminFetch("/api/admin/dashboard/review/duplicates/resolve", {
      method: "POST",
      body: JSON.stringify({ candidateId, action: "dismiss" }),
    });
    load();
  }

  async function handleMerge() {
    if (!mergeTarget) return;
    const res = await adminFetch("/api/admin/dashboard/review/duplicates/resolve", {
      method: "POST",
      body: JSON.stringify({
        candidateId: mergeTarget.candidateId,
        action: "merge",
        primaryUid: mergeTarget.primaryUid,
        secondaryUid: mergeTarget.secondaryUid,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "No se ha podido fusionar.");
    setMergeTarget(null);
    load();
  }

  async function handleBlockPair(reason: string) {
    if (!personA || !personB) return;
    const res = await adminFetch("/api/admin/dashboard/review/block-pair", {
      method: "POST",
      body: JSON.stringify({ uidA: personA.uid, uidB: personB.uid, reason }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "No se ha podido bloquear la pareja.");
    setShowBlockConfirm(false);
    setPersonA(null);
    setPersonB(null);
    load();
  }

  if (error) return <AdminError message={error} />;

  return (
    <div className="max-w-4xl pb-16">
      <h1 className="font-serif text-[26px] text-ink">Revisión</h1>

      <section className="mt-8">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">Posibles duplicados</h2>
        {!duplicates ? (
          <AdminLoading />
        ) : duplicates.length === 0 ? (
          <AdminEmpty message="No hay duplicados pendientes de revisión." />
        ) : (
          <div className="mt-3 space-y-3">
            {duplicates.map((d) => (
              <div key={d.id} className="rounded-xl border border-hairline bg-white p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <PersonMini person={d.profileLow} />
                    <span className="text-ink-soft">≈</span>
                    <PersonMini person={d.profileHigh} />
                  </div>
                  <Badge tone="warning">Puntuación {d.score}</Badge>
                </div>
                <p className="mt-2 text-[12px] text-ink-soft">
                  Detectado por: {d.signals.map((s) => SIGNAL_LABELS[s] ?? s).join(", ")}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() =>
                      setMergeTarget({
                        candidateId: d.id,
                        primaryUid: d.uidLow,
                        secondaryUid: d.uidHigh,
                        label: `Fusionar en ${d.profileLow.firstName}`,
                      })
                    }
                    className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-white"
                  >
                    Confirmar duplicado (fusionar en {d.profileLow.firstName})
                  </button>
                  <button
                    onClick={() =>
                      setMergeTarget({
                        candidateId: d.id,
                        primaryUid: d.uidHigh,
                        secondaryUid: d.uidLow,
                        label: `Fusionar en ${d.profileHigh.firstName}`,
                      })
                    }
                    className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-white"
                  >
                    Confirmar duplicado (fusionar en {d.profileHigh.firstName})
                  </button>
                  <button
                    onClick={() => handleDismiss(d.id)}
                    className="rounded-full border border-hairline px-4 py-1.5 text-[12px] font-medium text-ink-soft hover:text-ink"
                  >
                    No es duplicado
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">Parejas bloqueadas</h2>
        {!blocked ? (
          <AdminLoading />
        ) : blocked.length === 0 ? (
          <AdminEmpty message="No hay parejas bloqueadas." />
        ) : (
          <div className="mt-3 space-y-2">
            {blocked.map((b) => (
              <div key={`${b.personIdLow}_${b.personIdHigh}`} className="rounded-xl border border-hairline bg-white p-4">
                <div className="flex items-center gap-4">
                  <PersonMini person={b.personLow} />
                  <span className="text-ink-soft">⛔</span>
                  <PersonMini person={b.personHigh} />
                </div>
                {b.reason && <p className="mt-2 text-[13px] text-ink-soft">Motivo: {b.reason}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">Bloquear una pareja</h2>
        <p className="mt-2 text-[13px] text-ink-soft">
          Exclusión permanente de seguridad — nunca se volverán a proponer entre sí.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <PersonPicker label="Buscar primera persona…" selected={personA} onSelect={setPersonA} />
          <PersonPicker label="Buscar segunda persona…" selected={personB} onSelect={setPersonB} />
        </div>
        <button
          disabled={!personA || !personB}
          onClick={() => setShowBlockConfirm(true)}
          className="mt-3 rounded-full bg-[#8a3b3b] px-5 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Bloquear pareja
        </button>
      </section>

      {mergeTarget && (
        <ConfirmDialog
          title="Confirmar duplicado"
          description={`${mergeTarget.label}. La cuenta secundaria quedará marcada como duplicado confirmado y excluida del matching de forma permanente. Esta acción no se puede deshacer desde el panel.`}
          confirmLabel="Fusionar cuentas"
          tone="danger"
          onConfirm={handleMerge}
          onClose={() => setMergeTarget(null)}
        />
      )}

      {showBlockConfirm && personA && personB && (
        <ConfirmDialog
          title="Bloquear pareja"
          description={`${personA.firstName} y ${personB.firstName} nunca volverán a ser propuestos entre sí, ni por el algoritmo ni manualmente.`}
          confirmLabel="Bloquear"
          tone="danger"
          requireReason
          onConfirm={handleBlockPair}
          onClose={() => setShowBlockConfirm(false)}
        />
      )}
    </div>
  );
}

function PersonMini({ person }: { person: PersonBrief }) {
  const content = (
    <div className="flex items-center gap-2">
      <PhotoThumb path={person.photoPath} alt={person.firstName} size={32} />
      <span className="text-[14px] text-ink">{person.firstName}</span>
    </div>
  );
  return person.uid ? (
    <Link href={`/admin/members/${person.uid}`} className="hover:underline">
      {content}
    </Link>
  ) : (
    content
  );
}
