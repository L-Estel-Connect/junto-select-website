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
          "Hola,\n\nNo hemos podido completar el cobro de tu membresía Junto Select. " +
            "Te pedimos que revises tu método de pago para que tu membresía siga activa sin interrupciones.",
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
          `Hola,\n\nTu membresía Junto Select se renovará${dateLine}. Puedes revisar o gestionar tu membresía ` +
            "en cualquier momento, sin compromiso.",
          appBaseUrl,
          "/member/plan",
        ),
      };
    }
    case "account_deleted":
      return {
        subject: "Tu perfil de Junto Select ha sido eliminado",
        textContent:
          "Hola,\n\nConfirmamos que tu perfil, tus fotografías y tu acceso a Junto Select se han " +
          "eliminado de forma permanente, tal y como solicitaste.\n\nGracias por haber confiado en nosotros.\n\nJunto Select",
      };
    case "new_proposal":
      return {
        subject: "Tienes una nueva selección — Junto Select",
        textContent: withFooter(
          "Hola,\n\nHemos seleccionado a alguien para ti. Inicia sesión para conocer tu nueva selección.",
          appBaseUrl,
          "/member/proposals",
        ),
      };
    case "invitation_received":
      return {
        subject: "Alguien está interesado/a en conocerte — Junto Select",
        textContent: withFooter(
          "Hola,\n\nUna persona seleccionada por Junto Select ha mostrado interés en conocerte. " +
            "Responder es gratis. Inicia sesión para verlo con calma.",
          appBaseUrl,
          "/member/proposals",
        ),
      };
    case "mutual_introduction":
      return {
        subject: "El interés es mutuo — Junto Select",
        textContent: withFooter(
          "Hola,\n\nEl interés es mutuo. Inicia sesión para ver vuestra introducción y los datos de contacto.",
          appBaseUrl,
          "/member/connections",
        ),
      };
    // Deliberate, sole exception to this module's "never a first name"
    // rule: this is a one-time invitation addressed back to someone who
    // gave US that name themselves on the old form, not matching data
    // about anyone else — see legacyImport/writeImport.ts's
    // queueActivationEmails, the only caller. Falls back to a
    // name-free greeting if the old form's name couldn't be safely
    // parsed into a first name (see mapping.ts extractFirstName).
    case "legacy_profile_activation": {
      const firstName = typeof data.firstName === "string" && data.firstName.trim() ? data.firstName.trim() : null;
      const greeting = firstName ? `Hola ${firstName},` : "Hola,";
      return {
        subject: "Tu perfil de Junto Select está listo",
        textContent: withFooter(
          `${greeting}\n\n` +
            "Hace un tiempo nos compartiste tus datos para formar parte de Junto Select.\n\n" +
            "Ahora hemos creado una plataforma privada para gestionar las presentaciones de una forma más sencilla y segura.\n\n" +
            "Hemos precompletado tu perfil únicamente con la información que ya nos habías facilitado.\n\n" +
            "Tu perfil todavía no está activo y no será presentado a otros miembros hasta que tú decidas revisarlo, completarlo y activarlo.\n\n" +
            "Podrás revisar y modificar toda la información antes de activar tu perfil.\n\n" +
            "Si no quieres continuar, no tienes que activar nada. También puedes solicitar la eliminación de tus datos respondiendo a este email.",
          appBaseUrl,
          "/introduction/legacy",
        ),
      };
    }
    // Content-free by design (see the audit's privacy/consent analysis):
    // never says who is asking, never says how many people asked, never
    // implies mutual interest. One per participant per event regardless
    // of how many different people requested them (see
    // EventParticipantDocument.invitationEmailSentAt) — never a re-ask
    // that could feel like pressure.
    case "event_reconnect_invite": {
      const eventLabel = typeof data.eventLabel === "string" && data.eventLabel ? data.eventLabel : "el evento";
      const eventId = typeof data.eventId === "string" ? data.eventId : "";
      return {
        subject: "Alguien que conociste quiere reconectar — Junto Select",
        textContent: withFooter(
          `Hola,\n\nAlguien que conociste en Junto Select · ${eventLabel} querría volver a conectar contigo.\n\n` +
            "Activa tu perfil de Reconnect para verlo y decidir si quieres aceptar.",
          appBaseUrl,
          eventId ? `/reconnect/${eventId}` : "/reconnect",
        ),
      };
    }
  }
}
