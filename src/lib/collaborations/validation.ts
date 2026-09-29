import type { CollaborationPayload, CollaborationType } from "./types";

export type CollaborationErrors = Partial<Record<keyof CollaborationPayload, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_TYPES: CollaborationType[] = ["partner_evento", "producto_experiencia", "a_medida", "otra"];

const NAME_MAX = 120;
const BRAND_MAX = 120;
const HANDLE_MAX = 200;
const MESSAGE_MAX = 1500;

export function validateCollaboration(data: CollaborationPayload): CollaborationErrors {
  const errors: CollaborationErrors = {};

  const nombre = data.nombre.trim();
  if (!nombre) {
    errors.nombre = "Introduce tu nombre.";
  } else if (nombre.length > NAME_MAX) {
    errors.nombre = "El nombre es demasiado largo.";
  }

  const marca = data.marca.trim();
  if (!marca) {
    errors.marca = "Introduce el nombre de tu marca o empresa.";
  } else if (marca.length > BRAND_MAX) {
    errors.marca = "Este campo es demasiado largo.";
  }

  const email = data.email.trim();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    errors.email = "Introduce un email válido.";
  }

  if (data.instagramOWeb && data.instagramOWeb.trim().length > HANDLE_MAX) {
    errors.instagramOWeb = "Este campo es demasiado largo.";
  }

  if (!VALID_TYPES.includes(data.tipoColaboracion as CollaborationType)) {
    errors.tipoColaboracion = "Selecciona un tipo de colaboración.";
  }

  const mensaje = data.mensaje.trim();
  if (!mensaje) {
    errors.mensaje = "Cuéntanos brevemente tu propuesta.";
  } else if (mensaje.length > MESSAGE_MAX) {
    errors.mensaje = `Máximo ${MESSAGE_MAX} caracteres.`;
  }

  return errors;
}

export const collaborationLimits = {
  NAME_MAX,
  BRAND_MAX,
  HANDLE_MAX,
  MESSAGE_MAX,
};
