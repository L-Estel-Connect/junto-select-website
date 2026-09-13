import Section from "@/components/Section";
import Wordmark from "@/components/Wordmark";
import Link from "next/link";

export const metadata = { title: "Términos y Condiciones" };

const TERMS_VERSION = "2026-09-terminos-v1";

const linkClasses = "text-ink underline decoration-hairline underline-offset-4 hover:text-ink";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-serif text-[19px] font-normal text-ink sm:text-[20px]">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-4 text-[15px] font-medium text-ink">{children}</h3>;
}
function LegalNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-md bg-rose-tint/40 px-3 py-2 text-[12px] italic leading-relaxed text-ink-soft">
      Nota interna — pendiente de revisión final por abogado especializado en derecho de consumo español/UE:{" "}
      {children}
    </p>
  );
}

export default function TerminosPage() {
  return (
    <Section as="main" size="sm" className="py-16 sm:py-20">
      <div className="mb-12 text-center">
        <Wordmark className="text-lg text-ink-soft" />
        <h1 className="mt-4 font-serif text-[28px] font-normal leading-snug text-ink sm:text-[32px]">
          Términos y Condiciones
        </h1>
        <p className="mt-2 text-[13px] text-ink-soft">
          Versión {TERMS_VERSION} · Junto Select Introduction
        </p>
      </div>

      <div className="space-y-12 text-[15px] leading-relaxed text-ink">
        <section className="space-y-3">
          <H2>1. Identificación del prestador</H2>
          <p>
            Junto Select Introduction es un servicio prestado por <strong>L-Estel Connect SL</strong>{" "}
            (en adelante, &ldquo;Junto Select&rdquo;, &ldquo;nosotros&rdquo; o &ldquo;la empresa&rdquo;),
            sociedad española con NIF <strong>B21674171</strong> y domicilio en El Campello, Alicante,
            España.
          </p>
          <p>
            Domicilio social completo: <strong>[DOMICILIO SOCIAL COMPLETO]</strong>.<br />
            Datos de inscripción en el Registro Mercantil: <strong>[DATOS REGISTRO MERCANTIL]</strong>.
            <br />
            Email de contacto legal: <strong>[EMAIL LEGAL / PRIVACIDAD]</strong>.
          </p>
          <p className="text-[13px] text-ink-soft">
            Estos datos se completan también en el{" "}
            <Link href="/aviso-legal" className={linkClasses}>
              Aviso Legal
            </Link>
            .
          </p>
        </section>

        <section className="space-y-3">
          <H2>2. Objeto del servicio</H2>
          <p>
            Junto Select Introduction es un servicio privado de presentaciones seleccionadas para
            personas solteras. <strong>No es un catálogo de perfiles ni una aplicación de
            &ldquo;swiping&rdquo;</strong>: los miembros no navegan libremente por perfiles de otras
            personas ni deciden a quién contactar. En su lugar, Junto Select selecciona, mediante
            criterios de compatibilidad definidos por cada persona, qué perfiles se presentan a quién.
          </p>
          <p>Para evitar confusión, estos son los conceptos que usamos de forma consistente:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Perfil pasivo:</strong> el estado por defecto de cualquier cuenta. Un perfil
              pasivo puede ser seleccionado como candidato para otro miembro y puede responder a una
              invitación, pero no recibe presentaciones propias.
            </li>
            <li>
              <strong>Búsqueda activa:</strong> el estado de un miembro con membresía de pago vigente.
              Su búsqueda está activa y puede recibir hasta 3 propuestas de perfil por ciclo mensual.
            </li>
            <li>
              <strong>Propuesta de perfil:</strong> cuando Junto Select selecciona a un candidato
              compatible y se lo presenta a un miembro con búsqueda activa. Una propuesta{" "}
              <strong>no es una introducción</strong> ni supone que la otra persona ya sepa nada de ti.
            </li>
            <li>
              <strong>Invitación:</strong> si el miembro que recibió la propuesta expresa interés, se
              invita gratuitamente al candidato original a revisar el perfil de quien mostró interés y
              decidir si también le interesa.
            </li>
            <li>
              <strong>Interés mutuo:</strong> cuando ambas personas han expresado interés, cada una por
              su lado, en la otra.
            </li>
            <li>
              <strong>Introducción:</strong> el resultado final, que solo existe cuando hay interés
              mutuo confirmado.
            </li>
          </ul>
          <p>
            Junto Select <strong>no garantiza resultados</strong> de ningún tipo — ver la sección 6.
          </p>
        </section>

        <section className="space-y-3">
          <H2>3. Requisitos de acceso</H2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Edad mínima: 35 años cumplidos.</li>
            <li>
              El usuario debe proporcionar información veraz, exacta y actualizada sobre sí mismo. Un
              perfil con información falsa o engañosa puede ser suspendido o eliminado.
            </li>
            <li>
              La cuenta es personal e intransferible. No está permitido crear o gestionar una cuenta en
              nombre de un tercero sin su consentimiento explícito, ni suplantar la identidad de otra
              persona.
            </li>
            <li>
              Están prohibidos los perfiles fraudulentos, el acoso, las conductas abusivas hacia otros
              miembros o el personal de Junto Select, y cualquier uso del servicio contrario a la ley o
              a estos Términos.
            </li>
            <li>
              Junto Select puede suspender o eliminar cuentas que incumplan estas normas, de forma
              proporcionada y conforme a la sección 14.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <H2>4. Perfil pasivo</H2>
          <p>
            Formar parte de Junto Select con un perfil pasivo es gratuito. Un perfil pasivo:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>puede ser seleccionado como candidato para las propuestas de otros miembros;</li>
            <li>puede recibir invitaciones gratuitas y responder a ellas sin coste alguno;</li>
            <li>
              <strong>no tiene derecho a recibir propuestas de perfil propias de forma proactiva</strong>{" "}
              — eso requiere activar la búsqueda (sección 5).
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <H2>5. Búsqueda activa</H2>
          <p>
            Al contratar una membresía de pago, Junto Select activa la búsqueda en nombre del miembro.
            Esto significa:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              El miembro puede recibir <strong>hasta 3 propuestas de perfil</strong> por ciclo mensual de
              selección (&ldquo;ciclo de matching&rdquo;).
            </li>
            <li>
              Este número es un <strong>máximo, nunca una cantidad garantizada</strong>. Priorizamos la
              calidad sobre la cantidad: puede haber menos de 3, o ninguna, en un ciclo determinado.
            </li>
            <li>
              Las propuestas no utilizadas <strong>no se acumulan</strong> de un ciclo a otro.
            </li>
            <li>
              El <strong>periodo de facturación</strong> (1, 3 o 6 meses, según el plan contratado) y el{" "}
              <strong>ciclo mensual de matching</strong> son conceptos independientes: un plan de 6
              meses no multiplica el límite de 3 propuestas — sigue siendo hasta 3 por mes, durante los
              6 meses de vigencia del plan.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <H2>6. No garantía de resultados</H2>
          <p>
            El pago de una membresía activa la búsqueda de Junto Select en tu nombre, pero{" "}
            <strong>no garantiza</strong>:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>un número mínimo de propuestas de perfil;</li>
            <li>que se produzca ningún emparejamiento (&ldquo;match&rdquo;);</li>
            <li>interés mutuo por parte de ningún candidato;</li>
            <li>que se llegue a producir una introducción;</li>
            <li>una cita;</li>
            <li>compatibilidad real entre las personas presentadas;</li>
            <li>el inicio de una relación de pareja;</li>
            <li>que cualquier persona propuesta acepte, responda o asista a nada.</li>
          </ul>
          <p>
            Estas limitaciones se refieren al <strong>resultado</strong> del servicio (encontrar pareja
            o generar interés en terceros), que por su naturaleza no depende únicamente de Junto Select.
            No excluyen ni pretenden excluir los derechos que la normativa de consumo reconoce cuando el{" "}
            <strong>servicio en sí mismo</strong> (la selección, el envío de propuestas conforme a los
            criterios declarados, el funcionamiento de la cuenta y la plataforma) no se presta conforme
            a lo contratado.
          </p>
          <LegalNote>
            confirmar que la redacción distingue con suficiente claridad, a efectos del art. 114 y ss.
            del TRLGDCU, entre &ldquo;no conformidad del servicio&rdquo; (reclamable) y el resultado
            aleatorio propio de un servicio de intermediación personal (no reclamable).
          </LegalNote>
        </section>

        <section className="space-y-3">
          <H2>7. Precios y facturación</H2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Plan de 1 mes: 49 € cada mes.</li>
            <li>Plan de 3 meses: 129 € cada 3 meses (equivalente a 43 €/mes).</li>
            <li>Plan de 6 meses: 234 € cada 6 meses (equivalente a 39 €/mes).</li>
          </ul>
          <p>
            El pago se realiza <strong>por adelantado</strong>, por la totalidad del periodo
            correspondiente al plan elegido. Las cifras de &ldquo;equivalente a X €/mes&rdquo; se
            muestran únicamente a título informativo — el importe realmente cargado es el del periodo
            completo (129 € o 234 €), nunca una cuota mensual separada.
          </p>
          <p>
            Los impuestos aplicables (incluido el IVA, cuando corresponda) se calculan y muestran en el
            proceso de pago gestionado por Stripe, en función del método de pago y la ubicación del
            usuario, conforme a la normativa fiscal vigente en cada momento.
          </p>
          <p>El pago se procesa a través de Stripe, Inc. Junto Select no almacena los datos de la tarjeta.</p>
        </section>

        <section className="space-y-3">
          <H2>8. Renovación automática</H2>
          <p>
            Las membresías se <strong>renuevan automáticamente</strong> al finalizar el periodo
            contratado (1, 3 o 6 meses), por la misma duración y al mismo precio, salvo que el miembro
            cancele la renovación antes de la fecha de renovación.
          </p>
          <p>
            La cancelación se realiza a través del mecanismo de gestión de membresía descrito en la
            sección 9.A (portal de gestión de Stripe).
          </p>
        </section>

        <section className="space-y-4">
          <H2>9. Cancelación y desistimiento</H2>
          <p>
            Estos son <strong>dos conceptos distintos</strong> y se rigen por reglas diferentes.
          </p>

          <H3>A) Cancelación de la renovación</H3>
          <ul className="list-disc space-y-2 pl-5">
            <li>El miembro puede cancelar la renovación futura en cualquier momento.</li>
            <li>
              La cancelación surte efecto <strong>al final del periodo ya pagado</strong> — no de forma
              inmediata.
            </li>
            <li>
              Hasta esa fecha, el miembro conserva todos los beneficios de la membresía activa
              (búsqueda activa, hasta 3 propuestas por mes, ventajas de eventos si las hubiera).
            </li>
            <li>
              Después de esa fecha, el perfil vuelve automáticamente al modo pasivo, salvo que se
              reactive la membresía.
            </li>
            <li>
              Salvo que la normativa de consumo aplicable disponga otra cosa, cancelar la renovación{" "}
              <strong>no genera un reembolso proporcional</strong> por el tiempo restante de un periodo
              de facturación ya iniciado. Esto no constituye una renuncia a ningún derecho legal de
              desistimiento — ver el apartado B.
            </li>
          </ul>

          <H3>B) Derecho legal de desistimiento</H3>
          <p>
            Como consumidor, dispones de un <strong>plazo de 14 días naturales</strong> desde la
            celebración del contrato (es decir, desde el pago) para desistir del mismo sin necesidad de
            justificar tu decisión, conforme al Real Decreto Legislativo 1/2007, de 16 de noviembre
            (texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios), y demás
            normativa aplicable.
          </p>
          <p>
            Debido a la naturaleza del servicio, tu búsqueda activa puede comenzar{" "}
            <strong>inmediatamente</strong> después del pago. Por ello, antes de completar la compra, te
            pedimos que marques expresamente, en el propio proceso de pago, la casilla mediante la que
            solicitas que la prestación del servicio comience de inmediato, antes de que finalice el
            plazo de desistimiento de 14 días.
          </p>
          <p>
            El hecho de solicitar el inicio inmediato del servicio{" "}
            <strong>no elimina automáticamente tu derecho de desistimiento</strong>. Si desistes
            válidamente dentro del plazo de 14 días después de haber solicitado expresamente el inicio
            inmediato del servicio:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              deberás abonar un importe proporcional al servicio ya prestado hasta el momento en que
              comuniques tu desistimiento, calculado en proporción al periodo de facturación contratado,
              cuando así lo prevea la normativa aplicable;
            </li>
            <li>
              si el servicio se hubiera ejecutado por completo (por ejemplo, porque el periodo de 1 mes
              ya ha finalizado) antes de ejercer el desistimiento, y se cumplen los requisitos legales
              para la pérdida del derecho de desistimiento en servicios plenamente ejecutados con tu
              consentimiento previo expreso e información adecuada, el derecho de desistimiento no
              podrá ejercerse.
            </li>
          </ul>
          <p>
            Transcurrido el plazo legal de desistimiento sin haberlo ejercido, cualquier cancelación
            posterior se rige por el apartado A anterior (cancelación de la renovación) y, con carácter
            general, no da lugar a la devolución del periodo ya pagado, sin perjuicio de los derechos
            imperativos que asistan al consumidor conforme a la normativa vigente.
          </p>
          <p>
            Para ejercer tu derecho de desistimiento, puedes utilizar el modelo de formulario incluido a
            continuación, o cualquier otra declaración inequívoca, dirigida a:{" "}
            <strong>[EMAIL PARA DESISTIMIENTO]</strong>.
          </p>
          <LegalNote>
            confirmar el cálculo exacto del &ldquo;importe proporcional&rdquo; y la redacción de la
            pérdida del derecho de desistimiento conforme a los arts. 103 y 108 TRLGDCU aplicados a un
            servicio de suscripción continuada (no un servicio instantáneo de ejecución única).
          </LegalNote>

          <div className="mt-6 rounded-lg border border-hairline p-5">
            <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-ink-soft">
              Modelo de formulario de desistimiento
            </p>
            <p className="mt-3 text-[14px] italic text-ink-soft">
              (Solo debe rellenar y enviar el presente formulario si desea desistir del contrato)
            </p>
            <div className="mt-4 space-y-2 text-[14px] text-ink">
              <p>A la atención de L-Estel Connect SL, [EMAIL PARA DESISTIMIENTO]:</p>
              <p>
                Por la presente le comunico que desisto de mi contrato de membresía Junto Select
                Introduction.
              </p>
              <p>— Contratado el día: ____________________</p>
              <p>— Nombre del consumidor: ____________________</p>
              <p>— Dirección del consumidor: ____________________</p>
              <p>— Firma del consumidor (solo si el formulario se presenta en papel)</p>
              <p>— Fecha: ____________________</p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <H2>10. Fallo en el pago de la renovación</H2>
          <p>
            Si un cobro de renovación no puede completarse, el sistema de pago (Stripe) reintenta el
            cobro automáticamente conforme a su propia lógica de reintentos. Mientras existan reintentos
            en curso, la membresía puede mostrarse en estado &ldquo;pago pendiente&rdquo; y el acceso a
            la búsqueda activa se mantiene temporalmente. Si finalmente ningún reintento tiene éxito, la
            suscripción se cancela y el perfil pasa automáticamente a modo pasivo. Junto Select no
            aplica plazos de gracia adicionales distintos de los que Stripe ejecuta como parte de su
            propio proceso de reintento.
          </p>
        </section>

        <section className="space-y-3">
          <H2>11. Eventos</H2>
          <p>
            La membresía puede incluir acceso prioritario, ventajas o descuentos en eventos organizados
            por Junto Select, cuando estos se ofrezcan. Salvo que se indique expresamente lo contrario
            para un evento concreto, estas ventajas pueden variar y se comunican de forma independiente
            a estos Términos. Esta sección no regula la venta de entradas a eventos — si Junto Select
            vende entradas de eventos de forma directa en el futuro, dicha venta se regirá por
            condiciones específicas propias, no por estas.
          </p>
        </section>

        <section className="space-y-3">
          <H2>12. Conducta del usuario y seguridad</H2>
          <p>Al usar Junto Select, el miembro se compromete a:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>proporcionar información veraz sobre sí mismo;</li>
            <li>tratar con respeto a otros miembros y al personal de Junto Select;</li>
            <li>no utilizar el servicio con fines ilegales, fraudulentos o de acoso;</li>
            <li>no crear perfiles falsos ni suplantar a terceros.</li>
          </ul>
          <p>
            Junto Select puede suspender o eliminar, de forma proporcionada, cuentas que incumplan estas
            normas o que supongan un riesgo para la seguridad de otros miembros, sin perjuicio de los
            derechos que correspondan al consumidor conforme a la sección 14.
          </p>
        </section>

        <section className="space-y-3">
          <H2>13. Propiedad intelectual</H2>
          <p>
            La marca &ldquo;Junto Select&rdquo;, el diseño, el software y los contenidos de la
            plataforma son propiedad de L-Estel Connect SL o se usan bajo licencia. El usuario conserva
            los derechos sobre el contenido que sube (por ejemplo, sus fotografías y textos de
            presentación), y concede a Junto Select únicamente la licencia necesaria para almacenar,
            procesar y mostrar dicho contenido a los efectos de prestar el servicio descrito en estos
            Términos.
          </p>
        </section>

        <section className="space-y-3">
          <H2>14. Suspensión y terminación</H2>
          <p>
            Junto Select puede suspender o cancelar una cuenta por incumplimiento grave o reiterado de
            estos Términos, por motivos de seguridad, o por requerimiento legal, de forma proporcionada
            a la gravedad de la conducta y, cuando sea razonablemente posible, previo aviso. Esto no
            afecta a los derechos legales que el consumidor pueda hacer valer frente a la terminación
            (por ejemplo, en relación con importes ya pagados por periodos no disfrutados debido a una
            terminación no imputable al usuario).
          </p>
        </section>

        <section className="space-y-3">
          <H2>15. Responsabilidad</H2>
          <p>
            En la medida permitida por la ley, la responsabilidad de Junto Select frente al usuario se
            limita a los daños directos y previsibles derivados del incumplimiento del servicio
            efectivamente contratado. Nada en estos Términos excluye ni limita la responsabilidad de
            Junto Select en los casos en que la ley no permite su exclusión o limitación, incluyendo
            (entre otros) el dolo, la negligencia grave, los daños personales causados por negligencia,
            o cualquier otra responsabilidad que no pueda excluirse conforme a la normativa de consumo
            aplicable.
          </p>
          <LegalNote>
            revisar el alcance exacto de la cláusula de limitación de responsabilidad frente al art. 86
            y ss. TRLGDCU (cláusulas abusivas) antes de publicar en producción.
          </LegalNote>
        </section>

        <section className="space-y-3">
          <H2>16. Cambios en los términos y en el servicio</H2>
          <p>
            Junto Select puede modificar estos Términos para reflejar cambios legales, operativos o del
            propio servicio. Los cambios que afecten materialmente a una membresía de pago ya contratada
            se comunicarán con antelación razonable antes de su entrada en vigor, y el usuario podrá
            cancelar la renovación si no está de acuerdo con el cambio, sin perjuicio de sus derechos
            legales.
          </p>
        </section>

        <section className="space-y-3">
          <H2>17. Ley aplicable y resolución de conflictos</H2>
          <p>
            Estos Términos se rigen por la legislación española. Para cualquier controversia, y sin
            perjuicio de los fueros y jurisdicciones que la normativa de protección de consumidores
            reconozca de forma imperativa al usuario-consumidor (que en ningún caso quedan limitados por
            esta cláusula), seremos competentes los tribunales españoles.
          </p>
          <p>
            Si tienes una reclamación, puedes contactarnos primero en{" "}
            <strong>[EMAIL LEGAL / PRIVACIDAD]</strong>. Como consumidor residente en la UE, también
            puedes acudir a las autoridades de consumo correspondientes a tu domicilio.
          </p>
          <LegalNote>
            la Comisión Europea cerró la plataforma de resolución de litigios en línea (ODR) el 20 de
            julio de 2025; no se ha incluido ningún enlace a dicha plataforma en este documento por
            estar obsoleta — confirmar si existe un mecanismo sustitutivo aplicable en el momento de la
            revisión final.
          </LegalNote>
        </section>
      </div>

      <p className="mt-16 text-center text-[13px] text-ink-soft">
        Consulta también nuestra{" "}
        <Link href="/privacidad" className={linkClasses}>
          Política de Privacidad
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
