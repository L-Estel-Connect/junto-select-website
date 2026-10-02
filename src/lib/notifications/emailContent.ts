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
          "Hola,\n\nEl interés es mutuo. Inicia sesión para ver vuestra conexión y los datos de contacto.",
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
        subject: "Junto Select Matchmaking ha evolucionado",
        textContent: withFooter(
          `${greeting}\n\n` +
            "Hace un tiempo compartiste tus datos con nosotros a través de un formulario para formar parte de Junto Select Matchmaking.\n\n" +
            "Desde entonces, Junto Select Matchmaking ha evolucionado y hoy se convierte en Junto Select Introducciones, una plataforma privada de presentaciones pensada para conocer personas compatibles de una forma más cuidada y personal.\n\n" +
            "Si te apetece seguir formando parte de Junto Select, puedes retomar tu información, completar tu perfil y decidir si quieres activarlo.\n\n" +
            "No hemos activado ningún perfil en tu nombre y nada será visible hasta que tú decidas continuar.\n\n" +
            "Si prefieres no seguir, no tienes que hacer nada.\n\n" +
            "Completar mi perfil:",
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
        subject: "Alguien de la última noche quiere volver a verte",
        textContent: withFooter(
          `Hola,\n\nAlguien que conociste en Junto Select · ${eventLabel} quiere volver a conectar contigo.\n\n` +
            "Activa Reconnect para descubrir quién es y decidir si tú también quieres volver a verle.\n\n" +
            "Tu participación es completamente opcional. Si prefieres no participar, también puedes eliminar tus " +
            "datos de Reconnect desde el mismo enlace.",
          appBaseUrl,
          eventId ? `/reconnect/${eventId}` : "/reconnect",
        ),
      };
    }
    // Deliberate, second exception to this module's "never a first name"
    // rule (see legacy_profile_activation above for the first): the
    // recipient already saw the accepter's first name in-app, on their own
    // pending-requests list, before this email is ever sent — naming them
    // again here reveals nothing new. The CTA deliberately points at the
    // lightweight `/reconnect/connections/...` surface rather than
    // `/member/connections/...` — see src/app/reconnect/connections: it
    // works identically for a finalized member and a Reconnect-only one,
    // so this one email never needs to know which the recipient is.
    case "event_reconnect_accepted": {
      const otherFirstName = typeof data.otherFirstName === "string" && data.otherFirstName ? data.otherFirstName : "La otra persona";
      const introductionId = typeof data.introductionId === "string" ? data.introductionId : "";
      return {
        subject: `${otherFirstName} ha aceptado tu solicitud de Reconnect`,
        textContent: withFooter(
          `Hola,\n\n${otherFirstName} también quiere seguir en contacto contigo.\n\n` +
            "Ya podéis ver vuestros datos de contacto en Conexiones.",
          appBaseUrl,
          introductionId ? `/reconnect/connections/${introductionId}` : "/reconnect/connections",
        ),
      };
    }
    // Internal ops notification, not a member email — see
    // OutboundEmailType's doc comment. No withFooter/app link: there is
    // nothing in the app for Lara to click through to, only the inquiry
    // itself, in full, right here.
    case "collaboration_proposal": {
      const str = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : "");
      const nombre = str("nombre") || "(sin nombre)";
      const marca = str("marca") || "(sin marca)";
      const email = str("email") || "(sin email)";
      const instagramOWeb = str("instagramOWeb");
      const tipoColaboracionLabel = str("tipoColaboracionLabel") || "(sin especificar)";
      const mensaje = str("mensaje") || "(sin mensaje)";
      return {
        subject: `Nueva propuesta de colaboración — ${marca}`,
        textContent:
          `Nueva propuesta recibida desde /colaboraciones:\n\n` +
          `Nombre: ${nombre}\n` +
          `Marca / Empresa: ${marca}\n` +
          `Email: ${email}\n` +
          (instagramOWeb ? `Instagram o web: ${instagramOWeb}\n` : "") +
          `Tipo de colaboración: ${tipoColaboracionLabel}\n\n` +
          `Mensaje:\n${mensaje}\n\n` +
          "Junto Select",
      };
    }
  }
}
