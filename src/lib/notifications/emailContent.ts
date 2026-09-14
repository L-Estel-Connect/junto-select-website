import type { OutboundEmailType } from "./outboundEmails";

/**
 * Pure, credential-free content building — no Firestore/Brevo access, so
 * this is trivially unit-testable on its own. Deliberately minimal and
 * generic: NEVER a first name, profile detail, compatibility score, or
 * any other private matching data — every email exists only to tell the
 * member something happened and send them back into the authenticated
 * app to see it, exactly as the product spec requires (no chat, no
 * private data in transit outside Junto Select).
 */
export interface EmailContent {
  subject: string;
  textContent: string;
}

function withFooter(body: string, appBaseUrl: string, path: string): string {
  return `${body}\n\n${appBaseUrl}${path}\n\nJunto Select`;
}

export function buildEmailContent(
  type: OutboundEmailType,
  data: Record<string, unknown>,
  appBaseUrl: string,
): EmailContent {
  switch (type) {
    case "payment_failed":
      return {
        subject: "No hemos podido procesar tu pago — Junto Select",
        textContent: withFooter(
          "Hola,\n\nNo hemos podido procesar el último cobro de tu membresía Junto Select. " +
            "Revisa tu método de pago para no perder el acceso a tu búsqueda activa.",
          appBaseUrl,
          "/member/plan",
        ),
      };
    case "renewal_reminder": {
      const renewalDate = typeof data.renewalDate === "string" ? data.renewalDate.slice(0, 10) : null;
      const dateLine = renewalDate ? ` el ${renewalDate}` : " próximamente";
      return {
        subject: "Tu membresía Junto Select se renueva pronto",
        textContent: withFooter(
          `Hola,\n\nTu membresía Junto Select se renovará${dateLine}. Si quieres hacer algún cambio, ` +
            "puedes gestionar tu membresía en cualquier momento.",
          appBaseUrl,
          "/member/plan",
        ),
      };
    }
    case "account_deleted":
      return {
        subject: "Tu perfil de Junto Select ha sido eliminado",
        textContent:
          "Hola,\n\nConfirmamos que tu perfil de Junto Select, tus fotografías y tu acceso han sido " +
          "eliminados de forma permanente, tal y como solicitaste.\n\nJunto Select",
      };
    case "new_proposal":
      return {
        subject: "Tienes una nueva selección en Junto Select",
        textContent: withFooter(
          "Hola,\n\nHemos seleccionado a alguien para ti. Inicia sesión para conocer más.",
          appBaseUrl,
          "/member/proposals",
        ),
      };
    case "invitation_received":
      return {
        subject: "Alguien está interesado/a en conocerte — Junto Select",
        textContent: withFooter(
          "Hola,\n\nUna persona seleccionada por Junto Select ha mostrado interés en conocerte. " +
            "Responder es gratis e inicia sesión para verlo.",
          appBaseUrl,
          "/member/proposals",
        ),
      };
    case "mutual_introduction":
      return {
        subject: "El interés es mutuo — Junto Select",
        textContent: withFooter(
          "Hola,\n\nEl interés es mutuo. Inicia sesión para ver la introducción y los datos de contacto.",
          appBaseUrl,
          "/member/connections",
        ),
      };
  }
}
