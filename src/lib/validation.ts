import {
  AGE_RANGES,
  COMMUNITY_CITIES,
  COMMUNITY_INTERESTS,
  type CommunityPayload,
} from "./types";

export type CommunityErrors = Partial<Record<keyof CommunityPayload, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 80;
const CITY_MAX = 80;
const PHONE_MAX = 25;
const COMPANY_MAX = 100;
const PHONE_RE = /^\+?[0-9 ().-]+$/;
const SOURCE_RE = /^[a-z0-9_]{1,48}$/;

export function validateCommunity(data: CommunityPayload): CommunityErrors {
  const errors: CommunityErrors = {};

  const nombre = data.nombre.trim();
  if (!nombre) errors.nombre = "Introduce tu nombre.";
  else if (nombre.length > NAME_MAX) errors.nombre = "El nombre es demasiado largo.";

  const email = data.email.trim();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) errors.email = "Introduce un email válido.";

  if (!(COMMUNITY_CITIES as readonly string[]).includes(data.ciudad)) {
    errors.ciudad = "Elige tu ciudad.";
  } else if (data.ciudad === "otra") {
    const otra = data.ciudadOtra.trim();
    if (otra.length > CITY_MAX) errors.ciudadOtra = "El nombre de la ciudad es demasiado largo.";
  }

  const telefono = data.telefono.trim();
  if (telefono) {
    const digits = telefono.replace(/\D/g, "").length;
    if (telefono.length > PHONE_MAX || !PHONE_RE.test(telefono) || digits < 6 || digits > 15) {
      errors.telefono = "Introduce un teléfono válido, o déjalo en blanco.";
    }
  }

  if (data.empresa.trim().length > COMPANY_MAX) errors.empresa = "El nombre de la empresa es demasiado largo.";

  if (data.genero !== "mujer" && data.genero !== "hombre") errors.genero = "Selecciona una opción.";

  // Required: nombre, email, género and the consent box. Everything else is optional.
  if (data.rangoEdad && !(AGE_RANGES as readonly string[]).includes(data.rangoEdad)) {
    errors.rangoEdad = "Selección no válida.";
  }

  if (data.intereses.some((i) => !(COMMUNITY_INTERESTS as readonly string[]).includes(i))) {
    errors.intereses = "Selección no válida.";
  }

  if (!data.aceptaInvitaciones) {
    errors.aceptaInvitaciones = "Para recibir nuestras invitaciones, marca esta casilla.";
  }

  return errors;
}

/** Keeps only a safe, short source tag; anything unexpected becomes the default. */
export function sanitizeSource(value: string): string {
  return SOURCE_RE.test(value) ? value : "web_unete";
}

export const communityLimits = { NAME_MAX, CITY_MAX, PHONE_MAX, COMPANY_MAX };
