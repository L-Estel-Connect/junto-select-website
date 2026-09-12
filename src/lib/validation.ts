import type { InvitationPayload } from "./types";

export type InvitationErrors = Partial<
  Record<keyof InvitationPayload, string>
>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 120;
const PROFESSION_MAX = 120;
const PHONE_MAX = 30;
const ABOUT_MAX = 600;

export function validateInvitation(
  data: InvitationPayload,
): InvitationErrors {
  const errors: InvitationErrors = {};

  const nombre = data.nombre.trim();
  if (!nombre) {
    errors.nombre = "Introduce tu nombre.";
  } else if (nombre.length > NAME_MAX) {
    errors.nombre = "El nombre es demasiado largo.";
  }

  if (data.genero !== "mujer" && data.genero !== "hombre") {
    errors.genero = "Selecciona una opción.";
  }

  const email = data.email.trim();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    errors.email = "Introduce un email válido.";
  }

  if (data.profesion && data.profesion.length > PROFESSION_MAX) {
    errors.profesion = "Este campo es demasiado largo.";
  }

  if (data.telefono && data.telefono.length > PHONE_MAX) {
    errors.telefono = "Introduce un teléfono válido.";
  }

  if (data.sobreTi && data.sobreTi.length > ABOUT_MAX) {
    errors.sobreTi = `Máximo ${ABOUT_MAX} caracteres.`;
  }

  if (!data.confirmaEdad) {
    errors.confirmaEdad = "Debes confirmar que tienes 35 años o más.";
  }

  if (!data.aceptaComunicaciones) {
    errors.aceptaComunicaciones =
      "Debes aceptar recibir comunicaciones para poder enviarte una invitación.";
  }

  return errors;
}

export const invitationLimits = {
  NAME_MAX,
  PROFESSION_MAX,
  PHONE_MAX,
  ABOUT_MAX,
};
