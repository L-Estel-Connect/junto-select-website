import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/salon/SiteHeader";
import SiteFooter from "@/components/salon/SiteFooter";
import { instrumentSans, newsreader } from "@/lib/salon/fonts";
import "./(public)/salon.css";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false, follow: false },
};

/**
 * Every unknown address. Rendered outside the public layout, so it brings
 * the Salón identity itself: same header, footer and type as the public site.
 */
export default function NotFound() {
  return (
    <div className={`salon ${newsreader.variable} ${instrumentSans.variable}`}>
      <main>
        <SiteHeader variant="solid" />
        <section className="form-page">
          <div className="wrap">
            <div className="done">
              <p className="eyebrow">Junto Select</p>
              <h1>Esta página no existe.</h1>
              <p>Puede que el enlace haya cambiado o que la dirección no sea correcta.</p>
              <Link className="link" href="/">
                Volver al inicio
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
