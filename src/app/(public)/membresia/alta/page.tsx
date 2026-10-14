import type { Metadata } from "next";
import { Suspense } from "react";
import SiteHeader from "@/components/salon/SiteHeader";
import MembershipSignup from "@/components/salon/MembershipSignup";

export const metadata: Metadata = {
  title: "Hazte miembro Select",
  robots: { index: false, follow: false },
};

export default function MembershipSignupPage() {
  return (
    <main>
      <SiteHeader variant="solid" />
      <section className="form-page">
        <div className="wrap form-grid">
          <div className="form-aside">
            <p className="eyebrow">Membresía Select</p>
            <h1>
              Hazte miembro <em>Select.</em>
            </h1>
            <p className="txt">
              Tres pasos: tu plan, tu cuenta y el pago. Tus ventajas de miembro empiezan ese mismo día. La búsqueda
              activa de introducciones empieza cuando completes tu perfil privado.
            </p>
            <p className="note">Disponible en Madrid. Tu membresía empieza el día del pago.</p>
          </div>
          <Suspense fallback={<p className="muted">Cargando…</p>}>
            <MembershipSignup />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
