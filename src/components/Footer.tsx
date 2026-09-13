import Link from "next/link";
import Section from "./Section";
import Wordmark from "./Wordmark";

const legalLinkClasses =
  "text-ink-soft underline decoration-hairline underline-offset-4 hover:text-ink";

export default function Footer() {
  return (
    <Section as="footer" className="border-t border-hairline py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Wordmark className="text-base text-ink-soft" />
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
          <Link href="/terminos" className={legalLinkClasses}>
            Términos y Condiciones
          </Link>
          <Link href="/privacidad" className={legalLinkClasses}>
            Política de Privacidad
          </Link>
          <Link href="/aviso-legal" className={legalLinkClasses}>
            Aviso Legal
          </Link>
        </nav>
        <p className="text-xs text-ink-soft">
          Madrid · © {new Date().getFullYear()} Junto Select
        </p>
      </div>
    </Section>
  );
}
