"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/useAuth";
import { auth } from "@/lib/firebase/client";
import { signOutUser } from "@/lib/firebase/auth";
import { IntroductionError, IntroductionLoading } from "@/components/introduction/RequireIntroductionAuth";
import { useMemberProfile } from "./useMemberProfile";

const linkClasses =
  "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-10 first:mt-0">
      <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">
        {title}
      </p>
      <div className="mt-4 border-t border-hairline">{children}</div>
    </div>
  );
}

function SettingsRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-hairline py-4">
      <span className="text-[15px] text-ink">{label}</span>
      <span className="text-[13px] text-ink-soft">{value}</span>
    </div>
  );
}

/**
 * A deliberate two-step confirmation (checkbox must be checked before the
 * destructive button becomes clickable) rather than a single click — the
 * action is permanent and, if a paid membership is active, also cancels
 * Stripe billing immediately, so it must never be triggerable by a stray
 * or accidental click.
 */
function DeleteProfileModal({
  onClose,
  onDeleted,
}: {
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("no_auth");
      const response = await fetch("/api/member/delete-profile", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = (await response.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) throw new Error(data?.error ?? "request_failed");
      onDeleted();
    } catch {
      setError(
        "No hemos podido eliminar tu perfil. Inténtalo de nuevo en unos minutos, o escríbenos a juntoselect@gmail.com.",
      );
      setDeleting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-profile-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6"
    >
      <div className="w-full max-w-[440px] rounded-2xl bg-paper p-7 shadow-xl">
        <h2 id="delete-profile-title" className="font-serif text-[20px] font-normal text-ink">
          Eliminar tu perfil
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
          Esta acción es <strong className="text-ink">permanente</strong> y no se puede deshacer. Al
          eliminar tu perfil:
        </p>
        <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-ink-soft">
          <li>— Dejarás de aparecer como candidato/a en futuras selecciones.</li>
          <li>— Tus fotografías se eliminarán de forma permanente.</li>
          <li>
            — Si tienes una membresía de pago activa, se cancelará de inmediato: no se te volverá a
            cobrar.
          </li>
          <li>— Cerraremos tu sesión y no podrás volver a acceder con esta cuenta.</li>
        </ul>
        <label className="mt-5 flex items-start gap-3 text-[13px] leading-relaxed text-ink">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>Entiendo que esta acción es permanente y no se puede deshacer.</span>
        </label>
        {error && (
          <p role="alert" className="mt-3 text-[13px] text-[#8a3b3b]">
            {error}
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="flex-1 rounded-full border border-hairline px-5 py-3 text-[13px] font-medium uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!confirmed || deleting}
            className="flex-1 rounded-full bg-[#8a3b3b] px-5 py-3 text-[13px] font-medium uppercase tracking-[0.12em] text-white transition-opacity disabled:opacity-40"
          >
            {deleting ? "Eliminando…" : "Eliminar mi perfil"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsSection({ uid }: { uid: string }) {
  const { user } = useAuth();
  const { ready, error, refresh } = useMemberProfile(uid);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const router = useRouter();
  if (!ready) {
    if (error) return <IntroductionError message={error} onRetry={() => void refresh()} />;
    return <IntroductionLoading />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-6 py-14 sm:px-0">
      <h1 className="font-serif text-[26px] font-normal leading-snug text-ink sm:text-[28px]">
        Ajustes
      </h1>

      <SettingsGroup title="Cuenta">
        <SettingsRow label="Email" value={user?.email ?? "—"} />
        <div className="border-b border-hairline py-4">
          <Link href="/member/profile#editar-perfil" className={`text-[14px] ${linkClasses}`}>
            Editar información del perfil
          </Link>
        </div>
        <div className="border-b border-hairline py-4">
          <Link href="/member/profile/contact" className={`text-[14px] ${linkClasses}`}>
            Preferencias de contacto
          </Link>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Privacidad">
        <div className="border-b border-hairline py-4">
          <Link href="/privacidad" className={`text-[14px] ${linkClasses}`}>
            Cómo protegemos tu información
          </Link>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Legal">
        <div className="border-b border-hairline py-4">
          <Link href="/terminos" className={`text-[14px] ${linkClasses}`}>
            Términos de uso
          </Link>
        </div>
        <div className="border-b border-hairline py-4">
          <Link href="/privacidad" className={`text-[14px] ${linkClasses}`}>
            Política de privacidad
          </Link>
        </div>
        <div className="border-b border-hairline py-4">
          <Link href="/aviso-legal" className={`text-[14px] ${linkClasses}`}>
            Aviso legal
          </Link>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Sesión">
        <div className="border-b border-hairline py-4">
          <button type="button" onClick={() => signOutUser()} className={`text-[14px] ${linkClasses}`}>
            Cerrar sesión
          </button>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Zona sensible">
        <div className="border-b border-hairline py-4">
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="text-[14px] text-[#8a3b3b] underline decoration-hairline underline-offset-4 hover:opacity-80"
          >
            Eliminar perfil
          </button>
          <p className="mt-2 max-w-[46ch] text-[12px] leading-relaxed text-ink-soft">
            Elimina tu perfil, tus fotografías y tu acceso de forma permanente. Si tienes una
            membresía activa, se cancela de inmediato.
          </p>
        </div>
      </SettingsGroup>

      {showDeleteModal && (
        <DeleteProfileModal
          onClose={() => setShowDeleteModal(false)}
          onDeleted={() => {
            void signOutUser();
            router.replace("/");
          }}
        />
      )}
    </div>
  );
}
