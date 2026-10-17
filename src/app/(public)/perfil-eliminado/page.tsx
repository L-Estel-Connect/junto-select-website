import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/salon/SiteHeader";
import SignOutOnMount from "./SignOutOnMount";

export const metadata: Metadata = {
  title: "Perfil eliminado",
  robots: { index: false, follow: false },
};

/** Where "Eliminar mi perfil" lands once the server has confirmed the deletion. */
export default function ProfileDeletedPage() {
  return (
    <main>
      <SignOutOnMount />
      <SiteHeader variant="solid" />
      <section className="form-page">
        <div className="wrap">
          <div className="done" role="status">
            <p className="eyebrow">Junto Select</p>
            <h1>Tu perfil se ha eliminado.</h1>
            <p>
              Hemos eliminado de forma permanente tu perfil, tus fotografías y tu acceso. Ya no aparecerás en
              ninguna nueva propuesta de introducción. Si tenías una membresía activa, se ha cancelado y no
              volveremos a cobrarte.
            </p>
            <Link className="link" href="/">
              Volver al inicio
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
