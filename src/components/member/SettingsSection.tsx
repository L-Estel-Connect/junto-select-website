"use client";

import Link from "next/link";
import { useAuth } from "@/lib/firebase/useAuth";
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

export default function SettingsSection({ uid }: { uid: string }) {
  const { user } = useAuth();
  const { ready, error, refresh } = useMemberProfile(uid);
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
            disabled
            title="Próximamente"
            className="cursor-not-allowed text-[14px] text-ink-soft opacity-60"
          >
            Eliminar perfil
          </button>
          <p className="mt-2 max-w-[46ch] text-[12px] leading-relaxed text-ink-soft">
            Todavía no está disponible. La eliminación de un perfil requiere
            un proceso seguro que aún no hemos construido.
          </p>
        </div>
      </SettingsGroup>
    </div>
  );
}
