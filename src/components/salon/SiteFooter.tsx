import Link from "next/link";
import {
  CONTACT_EMAIL,
  FOOTER_NAV,
  INSTAGRAM_URL,
  MATCHMAKING_HREF,
  PRIVATE_POOL_HREF,
  SIGN_IN_HREF,
  SIGN_IN_LABEL,
  joinHref,
} from "@/lib/site/content";

export default function SiteFooter() {
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="ftr-partner">
          <div>
            <p className="eyebrow">Patrocinios y colaboraciones</p>
            <h3>
              Una audiencia definida, <em>en un entorno cuidado.</em>
            </h3>
            <p>
              Junto Select reúne a solteros a partir de 40 años en encuentros presenciales con plazas limitadas.
              Colaboramos con espacios y marcas que buscan conectar con esta comunidad en un entorno seleccionado.
            </p>
          </div>
          <div>
            <Link className="btn" href="/colaboraciones">
              Proponer una colaboración
            </Link>
          </div>
        </div>
        <div className="ftr-top">
          <div>
            <Link className="word" href="/">
              Junto <span>Select</span>
            </Link>
            <p className="tag">El club privado de los solteros con trayectoria.</p>
          </div>
          <div>
            <h4>El club</h4>
            <ul>
              {FOOTER_NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Formar parte</h4>
            <ul>
              <li><Link href={joinHref()}>Recibir invitaciones</Link></li>
              <li><Link href={MATCHMAKING_HREF}>Matchmaking privado</Link></li>
              <li><Link href={PRIVATE_POOL_HREF}>La red privada</Link></li>
              <li><Link href={SIGN_IN_HREF}>{SIGN_IN_LABEL}</Link></li>
            </ul>
          </div>
          <div>
            <h4>Contacto</h4>
            <ul>
              <li><Link href="/colaboraciones">Patrocinios y colaboraciones</Link></li>
              <li><a href={`mailto:${CONTACT_EMAIL}`}>Contacto</a></li>
              <li><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram</a></li>
            </ul>
          </div>
        </div>
        <div className="ftr-bot">
          <span>© {new Date().getFullYear()} Junto Select</span>
          <nav aria-label="Legal">
            <Link href="/terminos">Términos y condiciones</Link>
            <Link href="/privacidad">Política de privacidad</Link>
            <Link href="/aviso-legal">Aviso legal</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
