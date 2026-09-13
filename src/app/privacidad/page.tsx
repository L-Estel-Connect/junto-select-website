import Section from "@/components/Section";
import Wordmark from "@/components/Wordmark";
import Link from "next/link";

export const metadata = { title: "Política de Privacidad" };

const PRIVACY_VERSION = "2026-09-privacidad-v1";

const linkClasses = "text-ink underline decoration-hairline underline-offset-4 hover:text-ink";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-serif text-[19px] font-normal text-ink sm:text-[20px]">{children}</h2>;
}
function LegalNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-md bg-rose-tint/40 px-3 py-2 text-[12px] italic leading-relaxed text-ink-soft">
      Nota interna — pendiente de completar/revisar: {children}
    </p>
  );
}

export default function PrivacidadPage() {
  return (
    <Section as="main" size="sm" className="py-16 sm:py-20">
      <div className="mb-12 text-center">
        <Wordmark className="text-lg text-ink-soft" />
        <h1 className="mt-4 font-serif text-[28px] font-normal leading-snug text-ink sm:text-[32px]">
          Política de Privacidad
        </h1>
        <p className="mt-2 text-[13px] text-ink-soft">
          Versión {PRIVACY_VERSION} · Junto Select Introduction
        </p>
      </div>

      <div className="space-y-12 text-[15px] leading-relaxed text-ink">
        <section className="space-y-3">
          <H2>1. Responsable del tratamiento</H2>
          <p>
            <strong>L-Estel Connect SL</strong>
            <br />
            NIF: B21674171
            <br />
            Domicilio: [DOMICILIO SOCIAL COMPLETO]
            <br />
            Email de privacidad: [EMAIL DE PRIVACIDAD]
          </p>
        </section>

        <section className="space-y-3">
          <H2>2. Qué datos tratamos</H2>
          <p>
            Solo recogemos los datos que el producto realmente utiliza. Según la sección del servicio
            que uses, esto puede incluir:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Datos de cuenta:</strong> tu email (a través de Firebase Authentication, con
              inicio de sesión mediante Google o enlace de acceso por email).
            </li>
            <li>
              <strong>Datos de identidad y perfil:</strong> nombre, fecha de nacimiento (para verificar
              la edad mínima de 35 años), género, ciudad, profesión, formación, altura, idiomas, e
              información sobre hijos y sobre el deseo de tenerlos en el futuro.
            </li>
            <li>
              <strong>Disponibilidad geográfica:</strong> tu relación con el mercado de Madrid (única
              zona en la que opera el servicio en esta fase).
            </li>
            <li>
              <strong>Fotografías</strong> que subes a tu perfil, almacenadas de forma privada.
            </li>
            <li>
              <strong>Preferencias de pareja:</strong> criterios imprescindibles y preferencias no
              excluyentes sobre la persona que buscas (género, rango de edad, hijos, tabaco, alcohol,
              actividad física, altura, tipo de relación buscada, etc.).
            </li>
            <li>
              <strong>Texto de presentación:</strong> respuestas breves que escribes sobre ti, usadas
              para generar (con tu revisión y aprobación) un texto de presentación.
            </li>
            <li>
              <strong>Preferencias de contacto:</strong> el método por el que prefieres que te
              contacten (WhatsApp, teléfono, email, Instagram o LinkedIn) y el dato de contacto
              correspondiente, si decides indicarlo.
            </li>
            <li>
              <strong>Datos de facturación y membresía:</strong> el estado de tu suscripción, el plan
              contratado y la fecha de renovación, gestionados a través de Stripe (ver sección 5). Junto
              Select no almacena los datos de tu tarjeta.
            </li>
            <li>
              <strong>Historial de interacción:</strong> las propuestas, invitaciones e introducciones
              en las que participas, y tus decisiones sobre ellas (interesado/a o paso).
            </li>
            <li>
              <strong>Datos técnicos y de seguridad:</strong> identificadores de tu cuenta de Firebase
              necesarios para mantener tu sesión y proteger el servicio frente a accesos no autorizados.
            </li>
          </ul>
          <p className="text-[13px] text-ink-soft">
            No recogemos ni usamos, porque el producto actual no los implementa: cookies de seguimiento,
            analítica de comportamiento, píxeles publicitarios, ni herramientas de marketing o CRM de
            terceros.
          </p>
        </section>

        <section className="space-y-3">
          <H2>3. Finalidades y bases legales</H2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Gestión de tu cuenta y perfil</strong> — ejecución del contrato de servicio que
              aceptas al registrarte.
            </li>
            <li>
              <strong>Prestación del servicio de selección y presentación de perfiles</strong> —
              ejecución del contrato.
            </li>
            <li>
              <strong>Filtrado de compatibilidad y selección de perfiles</strong> (ver sección 4) —
              ejecución del contrato, ya que es el núcleo del servicio que solicitas.
            </li>
            <li>
              <strong>Gestión de la membresía y facturación</strong> — ejecución del contrato, y
              cumplimiento de obligaciones legales (fiscales y contables) en cuanto a los registros de
              facturación.
            </li>
            <li>
              <strong>Verificación de la edad mínima</strong> — cumplimiento de una obligación
              contractual y legítima del servicio.
            </li>
            <li>
              <strong>Seguridad, prevención de fraude y de perfiles duplicados o falsos</strong> —
              interés legítimo de Junto Select y de los demás miembros en un servicio seguro y fiable.
            </li>
            <li>
              <strong>Atención al cliente</strong> — ejecución del contrato / interés legítimo en
              resolver tus consultas.
            </li>
            <li>
              <strong>Comunicaciones sobre el servicio</strong> (confirmaciones, avisos de pago,
              cambios relevantes) — ejecución del contrato.
            </li>
          </ul>
          <p>
            No utilizamos el consentimiento como base genérica para todo el tratamiento — solo se pide
            consentimiento específico cuando la ley lo exige (por ejemplo, para comunicaciones
            comerciales, si en algún momento se ofrecieran, lo cual el producto actual no hace).
          </p>
        </section>

        <section className="space-y-3">
          <H2>4. Cómo funciona la selección de perfiles</H2>
          <p>
            Junto Select utiliza los criterios que cada miembro declara (requisitos imprescindibles y
            preferencias) para decidir qué perfiles se presentan a quién. El proceso, en términos
            generales:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Primero se comprueban <strong>requisitos imprescindibles recíprocos</strong> declarados por
              ambas personas (por ejemplo, género buscado, rango de edad, tipo de relación, tabaco,
              hijos). Si alguno de estos requisitos no se cumple en cualquiera de las dos direcciones, el
              perfil queda descartado para esa persona.
            </li>
            <li>
              Entre los perfiles que superan ese filtro, se calcula una{" "}
              <strong>puntuación de compatibilidad estructurada</strong>, basada en preferencias no
              excluyentes (altura, alcohol, actividad física, idiomas, tipo de relación, formación), y
              solo se presentan los de mayor puntuación que superen un umbral mínimo de calidad.
            </li>
            <li>
              El resultado práctico para ti es que solo verás perfiles que ya han superado tus propios
              requisitos imprescindibles y los de la otra persona, ordenados por compatibilidad — nunca
              un listado completo de miembros.
            </li>
          </ul>
          <p>
            Este proceso <strong>no utiliza reconocimiento facial ni analiza el atractivo de tus
            fotografías</strong>, y no delega la decisión final en ningún modelo de inteligencia
            artificial: la selección se basa en reglas y una fórmula de puntuación definidas por Junto
            Select. La única función de inteligencia artificial del servicio (generación de un borrador
            de texto de presentación a partir de tus propias respuestas) siempre requiere tu revisión y
            aprobación explícita antes de usarse, y no interviene en la selección de perfiles.
          </p>
          <p>
            Una propuesta de perfil no genera ningún efecto jurídico ni te afecta de forma
            significativa por sí sola: es una sugerencia que tú decides libremente aceptar o descartar.
            Por ello, entendemos que este tratamiento no constituye una decisión basada únicamente en
            tratamiento automatizado con efectos jurídicos o significativos en el sentido del artículo
            22 del RGPD; en cualquier caso, puedes solicitarnos en cualquier momento información
            adicional sobre la lógica aplicada.
          </p>
        </section>

        <section className="space-y-3">
          <H2>5. Destinatarios y encargados del tratamiento</H2>
          <p>Solo compartimos datos con los proveedores estrictamente necesarios para operar el servicio:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Google Firebase / Google Cloud</strong> (Google Ireland Limited / Google LLC):
              autenticación de usuarios, base de datos (Firestore), almacenamiento de fotografías
              (Storage) y alojamiento de la aplicación (App Hosting).
            </li>
            <li>
              <strong>Stripe, Inc.:</strong> procesamiento de pagos y gestión de suscripciones. Stripe
              recibe los datos de pago directamente; Junto Select solo recibe el estado de la
              suscripción y su fecha de renovación.
            </li>
            <li>
              <strong>Anthropic:</strong> generación asistida del borrador de tu texto de presentación,
              a partir únicamente de los datos que tú mismo/a proporcionas en esa sección — nunca se le
              envían datos adicionales de tu perfil.
            </li>
            <li>
              <strong>Brevo:</strong> utilizado únicamente por el formulario público de solicitud de
              invitación a eventos en la página de inicio (una función independiente de la membresía
              Junto Select Introduction). Los datos de tu perfil de Junto Select Introduction no se
              envían a Brevo.
            </li>
          </ul>
          <p>No utilizamos ningún proveedor de analítica, publicidad, CRM o marketing distinto de los anteriores.</p>
        </section>

        <section className="space-y-3">
          <H2>6. Transferencias internacionales</H2>
          <p>
            Algunos de nuestros proveedores (Google/Firebase, Stripe, Anthropic) pueden procesar datos
            en centros ubicados fuera del Espacio Económico Europeo, en el marco de sus propias
            garantías contractuales (como las Cláusulas Contractuales Tipo de la Comisión Europea) o de
            marcos de adecuación vigentes en cada momento.
          </p>
          <LegalNote>
            confirmar con cada proveedor (Google/Firebase, Stripe, Anthropic) su estatus actual respecto
            al Data Privacy Framework UE-EE.UU. y/o las Cláusulas Contractuales Tipo vigentes, y
            reflejarlo aquí con el detalle exigido antes de publicar en producción.
          </LegalNote>
        </section>

        <section className="space-y-3">
          <H2>7. Plazos de conservación</H2>
          <p>
            Los plazos operativos exactos de conservación de cada categoría de datos están pendientes de
            una decisión de negocio/legal definitiva. La estructura prevista es:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Cuenta y perfil activos: mientras la cuenta permanezca activa.</li>
            <li>Cuenta en modo pasivo: mientras no se solicite la eliminación de la cuenta.</li>
            <li>
              Cuenta eliminada: [PLAZO PENDIENTE DE DEFINIR] tras la solicitud de eliminación, salvo lo
              indicado a continuación.
            </li>
            <li>
              Registros de facturación: el plazo exigido por la normativa fiscal y contable española
              (con carácter general, varios años).
            </li>
            <li>Registros de seguridad: [PLAZO PENDIENTE DE DEFINIR].</li>
            <li>
              Historial de emparejamiento (propuestas, periodos de espera entre la misma pareja de
              personas): [PLAZO PENDIENTE DE DEFINIR], por motivos de integridad del servicio.
            </li>
            <li>Datos necesarios para la gestión de reclamaciones legales: mientras no prescriba la acción correspondiente.</li>
          </ul>
          <LegalNote>
            fijar plazos operativos concretos para cada categoría antes de publicar esta política en
            producción.
          </LegalNote>
        </section>

        <section className="space-y-3">
          <H2>8. Tus derechos</H2>
          <p>Como titular de los datos, tienes derecho a:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Acceder a tus datos.</li>
            <li>Rectificar datos inexactos.</li>
            <li>Solicitar la supresión de tus datos.</li>
            <li>Solicitar la limitación de su tratamiento.</li>
            <li>Oponerte al tratamiento.</li>
            <li>Solicitar la portabilidad de tus datos.</li>
            <li>Retirar tu consentimiento en cualquier momento, cuando el tratamiento se base en él.</li>
          </ul>
          <p>
            Para ejercer estos derechos, escríbenos a <strong>[EMAIL DE PRIVACIDAD]</strong>.
          </p>
          <p>
            También tienes derecho a presentar una reclamación ante la Agencia Española de Protección
            de Datos:
            <br />
            Agencia Española de Protección de Datos —{" "}
            <a
              href="https://www.aepd.es"
              target="_blank"
              rel="noopener noreferrer"
              className={linkClasses}
            >
              www.aepd.es
            </a>
          </p>
        </section>

        <section className="space-y-3">
          <H2>9. Eliminación de cuenta</H2>
          <p>
            La eliminación de cuenta <strong>todavía no está disponible como función autoservicio</strong>{" "}
            en el producto — actualmente aparece como una opción deshabilitada en Ajustes, ya que
            requiere un proceso técnico seguro (borrado en Firestore, en Storage, y coordinación con la
            suscripción activa en Stripe) que aún no se ha construido. Se trata de una carencia de
            producto pendiente de resolver, no de una función ya operativa. Mientras tanto, puedes
            solicitar la eliminación de tu cuenta escribiendo a <strong>[EMAIL DE PRIVACIDAD]</strong>,
            y la gestionaremos manualmente.
          </p>
        </section>

        <section className="space-y-3">
          <H2>10. Seguridad</H2>
          <p>
            Aplicamos medidas técnicas y organizativas razonables para proteger tus datos, incluyendo el
            uso de reglas de acceso a nivel de base de datos y almacenamiento que restringen cada perfil
            y cada fotografía exclusivamente a su propietario, y el uso de infraestructura gestionada
            por proveedores con sus propias garantías de seguridad (Google Cloud/Firebase, Stripe). Ningún
            sistema es completamente infalible, y no podemos garantizar una seguridad absoluta.
          </p>
        </section>

        <section className="space-y-3">
          <H2>11. Edad mínima</H2>
          <p>
            Junto Select Introduction está reservado contractualmente a personas de 35 años o más. No
            recogemos intencionadamente datos de personas menores de esa edad.
          </p>
        </section>

        <section className="space-y-3">
          <H2>12. Cambios en esta política</H2>
          <p>
            Si introducimos cambios materiales en esta política, te lo comunicaremos por un medio
            razonable antes de que entren en vigor (por ejemplo, mediante un aviso dentro de la
            aplicación o por email) y actualizaremos la fecha de versión indicada al principio de este
            documento.
          </p>
        </section>
      </div>

      <p className="mt-16 text-center text-[13px] text-ink-soft">
        Consulta también nuestros{" "}
        <Link href="/terminos" className={linkClasses}>
          Términos y Condiciones
        </Link>{" "}
        y nuestro{" "}
        <Link href="/aviso-legal" className={linkClasses}>
          Aviso Legal
        </Link>
        .
      </p>
    </Section>
  );
}
