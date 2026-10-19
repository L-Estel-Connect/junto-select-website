/**
 * The candidate's phone, as one string in `contactPreferences.phone`
 * ("+34 600 123 456"). Shared by the browser (finish-registration form)
 * and the server (consent route), so it holds no client-only imports.
 */

export interface DialCode {
  code: string;
  country: string;
}

export const OTHER_DIAL_CODE = "otro";

/** Spain first (the default), then the countries candidates most often come from. */
export const DIAL_CODES: DialCode[] = [
  { code: "+34", country: "España" },
  { code: "+351", country: "Portugal" },
  { code: "+33", country: "Francia" },
  { code: "+39", country: "Italia" },
  { code: "+49", country: "Alemania" },
  { code: "+44", country: "Reino Unido" },
  { code: "+353", country: "Irlanda" },
  { code: "+32", country: "Bélgica" },
  { code: "+31", country: "Países Bajos" },
  { code: "+41", country: "Suiza" },
  { code: "+43", country: "Austria" },
  { code: "+352", country: "Luxemburgo" },
  { code: "+376", country: "Andorra" },
  { code: "+45", country: "Dinamarca" },
  { code: "+46", country: "Suecia" },
  { code: "+47", country: "Noruega" },
  { code: "+48", country: "Polonia" },
  { code: "+40", country: "Rumanía" },
  { code: "+1", country: "Estados Unidos / Canadá" },
  { code: "+52", country: "México" },
  { code: "+54", country: "Argentina" },
  { code: "+55", country: "Brasil" },
  { code: "+56", country: "Chile" },
  { code: "+57", country: "Colombia" },
  { code: "+51", country: "Perú" },
  { code: "+58", country: "Venezuela" },
  { code: "+593", country: "Ecuador" },
  { code: "+598", country: "Uruguay" },
  { code: "+212", country: "Marruecos" },
];

export function isValidPhone(value: string): boolean {
  return /^[+]?[\d\s()-]{7,20}$/.test(value.trim());
}

/** Splits a stored phone into the selector's code and the number field. No "+" means a Spanish number. */
export function splitPhone(stored: string | null | undefined): { dialCode: string; number: string } {
  const value = (stored ?? "").trim();
  if (!value) return { dialCode: "+34", number: "" };
  if (!value.startsWith("+")) return { dialCode: "+34", number: value };
  const match = [...DIAL_CODES]
    .sort((a, b) => b.code.length - a.code.length)
    .find((d) => value.startsWith(d.code) && !/\d/.test(value.charAt(d.code.length)));
  return match
    ? { dialCode: match.code, number: value.slice(match.code.length).trim() }
    : { dialCode: OTHER_DIAL_CODE, number: value };
}

/**
 * The value to store, or null when the number isn't usable. With "Otro",
 * the person types the whole international number, "+" included.
 */
export function composePhone(dialCode: string, number: string): string | null {
  const national = number.trim().replace(/\s+/g, " ");
  if (dialCode === OTHER_DIAL_CODE) {
    const digits = national.replace(/\D/g, "");
    return national.startsWith("+") && digits.length >= 8 && digits.length <= 15 && isValidPhone(national) ? national : null;
  }
  if (!/^[\d\s()-]+$/.test(national)) return null;
  const digits = national.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 14) return null;
  return `${dialCode} ${national}`;
}

/** A phone the team can use: what the new-registration requirement checks. */
export function hasUsablePhone(stored: string | null | undefined): boolean {
  const value = (stored ?? "").trim();
  return value.replace(/\D/g, "").length >= 6 && isValidPhone(value);
}
