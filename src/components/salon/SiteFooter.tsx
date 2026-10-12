import Link from "next/link";
import { SIGN_IN_HREF, joinHref } from "@/lib/site/content";

export default function SiteFooter() {
  return (
    <footer className="ftr">
      <div className="wrap">
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
              <li><Link href="/club">El Club</Link></li>
              <li><Link href="/membresia">Membresía Select</Link></li>
              <li><Link href="/eventos">Encuentros</Link></li>
              <li><Link href="/#ciudades">Ciudades</Link></li>
            </ul>
          </div>
          <div>
            <h4>Tu cuenta</h4>
            <ul>
              <li><Link href={joinHref()}>Únete al club</Link></li>
              <li><Link href="/membresia#planes">Hazte miembro Select</Link></li>
              <li><Link href={SIGN_IN_HREF}>Acceder</Link></li>
            </ul>
          </div>
          <div>
            <h4>Contacto</h4>
            <ul>
              <li><Link href="/colaboraciones">Colaboraciones</Link></li>
              <li><a href="mailto:contact@juntoselect.com">contact@juntoselect.com</a></li>
            </ul>
          </div>
        </div>
        <div className="ftr-bot">
          <span>© {new Date().getFullYear()} Junto Select · Madrid</span>
          <nav aria-label="Legal">
            <Link href="/terminos">Términos y Condiciones</Link>
            <Link href="/privacidad">Política de Privacidad</Link>
            <Link href="/aviso-legal">Aviso Legal</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
