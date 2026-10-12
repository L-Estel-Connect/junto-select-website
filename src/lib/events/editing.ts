/**
 * Pure helpers for the admin Events Manager (no Firebase imports): parsing
 * a pasted Ticket Tailor link, the default images, and validating an event
 * before it is saved. Shared by the admin page and the API routes.
 */
import { validateTicketTypeIds, isValidCheckoutUrl } from "@/lib/eventBenefits/validation";
import type { EventPublicStatus } from "@/lib/eventBenefits/types";

/**
 * Accepts what an admin is likely to paste: the public event page
 * (https://www.tickettailor.com/events/juntoselect/2439069), a checkout
 * link containing the number, "ev_2439069", or just "2439069". Returns the
 * numeric event id, the same form existing event records use as their id.
 */
export function parseTicketTailorEventRef(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const bare = text.match(/^(?:ev_)?(\d{4,})$/);
  if (bare) return bare[1];
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!/(^|\.)tickettailor\.com$/.test(url.hostname)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(/^(?:ev_)?(\d{4,})$/);
    if (m) return m[1];
  }
  return null;
}

/** Junto Select's own photos, offered when an event has no image of its own. */
export const DEFAULT_EVENT_IMAGES = [
  { url: "/images/private-curated.png", label: "Salón privado (por defecto)" },
  { url: "/images/who-you-meet.png", label: "Salón con velas" },
  { url: "/images/hero.png", label: "Terraza al atardecer" },
] as const;

export const UPLOADED_IMAGE_PREFIX = "/api/events/image?path=";

export interface EventInput {
  label: string;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  city: string | null;
  venuePublic: string | null;
  eventType: string | null;
  description: string | null;
  imageUrl: string | null;
  priceFromEuros: number | null;
  publicStatus: EventPublicStatus;
  memberBenefitEnabled: boolean;
  reconnectEnabled: boolean;
  ticketTailorTicketTypeIds: string[];
  ticketTailorCheckoutUrl: string | null;
}

const STATUSES: EventPublicStatus[] = ["draft", "coming_soon", "tickets_available", "sold_out", "completed"];
const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

/**
 * Normalizes and validates an admin form submission. Returns the clean
 * input, or a Spanish message naming the first problem. `linked` says
 * whether the event already has (or is being given) a Ticket Tailor event.
 */
export function validateEventInput(raw: Record<string, unknown>, linked: boolean): { ok: true; value: EventInput } | { ok: false; error: string } {
  const label = str(raw.label, 120);
  if (!label) return { ok: false, error: "Escribe el título del evento." };
  const eventDate = str(raw.eventDate, 10);
  if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return { ok: false, error: "La fecha no es válida." };
  const startTime = str(raw.startTime, 5);
  const endTime = str(raw.endTime, 5);
  for (const t of [startTime, endTime]) {
    if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return { ok: false, error: "La hora debe tener el formato HH:MM, por ejemplo 20:00." };
  }
  const publicStatus = STATUSES.find((s) => s === raw.publicStatus) ?? "draft";
  if (publicStatus !== "draft" && !eventDate) return { ok: false, error: "Indica la fecha antes de elegir un estado distinto de Borrador." };

  const imageUrl = str(raw.imageUrl, 1000);
  if (
    imageUrl &&
    !DEFAULT_EVENT_IMAGES.some((d) => d.url === imageUrl) &&
    !imageUrl.startsWith(UPLOADED_IMAGE_PREFIX) &&
    !/^https:\/\//.test(imageUrl)
  ) {
    return { ok: false, error: "La imagen no es válida." };
  }

  let priceFromEuros: number | null = null;
  if (raw.priceFromEuros !== null && raw.priceFromEuros !== undefined && raw.priceFromEuros !== "") {
    const n = Number(raw.priceFromEuros);
    if (!Number.isFinite(n) || n < 0 || n > 10000) return { ok: false, error: "El precio no es válido." };
    priceFromEuros = Math.round(n * 100) / 100;
  }

  const checkout = str(raw.ticketTailorCheckoutUrl, 500);
  if (checkout && !isValidCheckoutUrl(checkout)) return { ok: false, error: "El enlace de compra no es válido. Copia el enlace completo de Ticket Tailor (https://…)." };
  if (publicStatus === "tickets_available" && !checkout) {
    return { ok: false, error: "Para «Entradas disponibles» añade el enlace de compra de Ticket Tailor." };
  }

  const ids = (Array.isArray(raw.ticketTailorTicketTypeIds) ? raw.ticketTailorTicketTypeIds : [])
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
  const idCheck = validateTicketTypeIds(ids);
  if (!idCheck.valid) return { ok: false, error: idCheck.error ?? "Tipo de entrada no válido." };

  const memberBenefitEnabled = raw.memberBenefitEnabled === true;
  if (memberBenefitEnabled) {
    if (!linked) return { ok: false, error: "El beneficio del 20 % necesita un evento de Ticket Tailor. Añade el enlace de Ticket Tailor primero." };
    if (ids.length === 0) return { ok: false, error: "El beneficio del 20 % necesita al menos un tipo de entrada (empieza por tt_)." };
    if (!eventDate) return { ok: false, error: "El beneficio del 20 % necesita la fecha del evento." };
  }

  return {
    ok: true,
    value: {
      label,
      eventDate,
      startTime,
      endTime,
      city: str(raw.city, 60) ?? "Madrid",
      venuePublic: str(raw.venuePublic, 160),
      eventType: str(raw.eventType, 60),
      description: str(raw.description, 1200),
      imageUrl,
      priceFromEuros,
      publicStatus,
      memberBenefitEnabled,
      reconnectEnabled: raw.reconnectEnabled === true,
      ticketTailorTicketTypeIds: ids,
      ticketTailorCheckoutUrl: checkout,
    },
  };
}
