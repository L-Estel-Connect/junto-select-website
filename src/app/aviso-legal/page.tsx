import Section from "@/components/Section";
import Wordmark from "@/components/Wordmark";
import Link from "next/link";

export const metadata = { title: "Aviso Legal" };

const linkClasses = "text-ink underline decoration-hairline underline-offset-4 hover:text-ink";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-serif text-[19px] font-normal text-ink sm:text-[20px]">{children}</h2>;
}

/**
 * A separate Aviso Legal (rather than folding LSSI identification into
 * Términos/Privacidad) because Spain's LSSI (Ley 34/2002) requires this
 * exact set of identifying information to be "easily, directly and
 * permanently accessible" as its own thing — bundling it into a contract
 * document (Términos) that can require affirmative acceptance/versioning
 * mixes a statutory disclosure with a consent artifact, and this site
 * already has separate Términos/Privacidad routes, so a third, purely
 * informational page keeps that boundary clean.
 */
export default function AvisoLegalPage() {
  return (
    <Section as="main" size="sm" className="py-16 sm:py-20">
      <div className="mb-12 text-center">
        <Wordmark className="text-lg text-ink-soft" />
        <h1 className="mt-4 font-serif text-[28px] font-normal leading-snug text-ink sm:text-[32px]">
          Aviso Legal
        </h1>
      </div>

      <div className="space-y-10 text-[15px] leading-relaxed text-ink">
        <section className="space-y-3">
          <H2>Identificación del titular</H2>
          <p>
            En cumplimiento del deber de información establecido en el artículo 10 de la Ley 34/2002,
            de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico
            (LSSI-CE), se informa de los siguientes datos:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Denominación social:</strong> L-Estel Connect SL
            </li>
            <li>
              <strong>NIF:</strong> B21674171
            </li>
            <li>
              <strong>Domicilio social:</strong> [DOMICILIO SOCIAL COMPLETO] (El Campello, Alicante,
              España)
            </li>
            <li>
              <strong>Datos de inscripción en el Registro Mercantil:</strong> [DATOS REGISTRO
              MERCANTIL]
            </li>
            <li>
              <strong>Email de contacto:</strong> [EMAIL LEGAL / PRIVACIDAD]
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <H2>Objeto</H2>
          <p>
            El presente Aviso Legal regula el acceso y uso del sitio web y la aplicación de Junto
            Select Introduction. El acceso implica la aceptación de este Aviso Legal, de los{" "}
            <Link href="/terminos" className={linkClasses}>
              Términos y Condiciones
            </Link>{" "}
            y de la{" "}
            <Link href="/privacidad" className={linkClasses}>
              Política de Privacidad
            </Link>
            .
          </p>
        </section>

        <section className="space-y-3">
          <H2>Propiedad intelectual e industrial</H2>
          <p>
            La marca &ldquo;Junto Select&rdquo;, el código, el diseño y los contenidos de este sitio son
            propiedad de L-Estel Connect SL o se utilizan bajo licencia, y están protegidos por la
            normativa de propiedad intelectual e industrial aplicable.
          </p>
        </section>
      </div>
    </Section>
  );
}
