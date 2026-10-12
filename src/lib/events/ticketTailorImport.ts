import "server-only";
import { getTicketTailorClient } from "@/lib/ticketTailor/client";

/**
 * What a Ticket Tailor import pre-fills in the Events Manager form. Every
 * field is optional: Ticket Tailor's event response schema hasn't been
 * verified against a real response in this project, so each value is read
 * defensively and anything missing is simply left for the admin to type.
 * Nothing is saved here; the admin reviews the form and saves it.
 */
export interface TicketTailorImport {
  ticketTailorEventId: string;
  fields: {
    label?: string;
    eventDate?: string;
    startTime?: string;
    endTime?: string;
    imageUrl?: string;
    ticketTailorCheckoutUrl?: string;
    ticketTailorTicketTypeIds?: string[];
    publicStatus?: "tickets_available";
  };
  /** Human-readable names of what was filled / what needs typing. */
  imported: string[];
  missing: string[];
  /** Facts shown to the admin but deliberately not copied (e.g. the venue, which may be private). */
  notes: string[];
  /**
   * Ticket Tailor's own event description, for reference only. It is never
   * copied into the website description automatically: the site keeps its
   * editorial copy (40+ club positioning), and the admin copies text over
   * only by choice. An event's own age criteria (e.g. "35+") live there.
   */
  ticketTailorDescription: string | null;
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function dateTime(v: unknown): { date?: string; time?: string } {
  const o = obj(v);
  if (!o) return {};
  const date = text(o.date)?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
  const time = text(o.time)?.match(/^\d{2}:\d{2}/)?.[0];
  const iso = text(o.iso)?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return { date: date ?? iso?.[1], time: time ?? iso?.[2] };
}

const truthy = (v: unknown) => v === true || v === "true";

export function mapTicketTailorEvent(ticketTailorEventId: string, raw: Record<string, unknown>, pastedUrl: string | null): TicketTailorImport {
  const fields: TicketTailorImport["fields"] = {};
  const imported: string[] = [];
  const notes: string[] = [];

  const name = text(raw.name);
  if (name) {
    fields.label = name;
    imported.push("título");
  }
  const start = dateTime(raw.start);
  if (start.date) {
    fields.eventDate = start.date;
    imported.push("fecha");
  }
  if (start.time) {
    fields.startTime = start.time;
    imported.push("hora de inicio");
  }
  const end = dateTime(raw.end);
  if (end.time) {
    fields.endTime = end.time;
    imported.push("hora de fin");
  }
  const description = text(raw.description);
  const ticketTailorDescription = description ? htmlToText(description).slice(0, 4000) : null;
  if (ticketTailorDescription) notes.push("La descripción de Ticket Tailor no se copia en la web: se muestra abajo como referencia.");
  const images = obj(raw.images);
  const image = text(images?.header) ?? text(images?.thumbnail);
  if (image && image.startsWith("https://")) {
    fields.imageUrl = image;
    imported.push("imagen");
  }

  const url = pastedUrl ?? text(raw.url) ?? text(raw.checkout_url);
  if (url && url.startsWith("https://")) {
    fields.ticketTailorCheckoutUrl = url;
    imported.push("enlace de compra");
  }

  const ticketTypes = Array.isArray(raw.ticket_types) ? raw.ticket_types.map(obj).filter((t): t is Record<string, unknown> => !!t) : [];
  const ids = ticketTypes.map((t) => text(t.id)).filter((id): id is string => !!id && id.startsWith("tt_"));
  if (ids.length > 0) {
    fields.ticketTailorTicketTypeIds = ids;
    imported.push(`tipos de entrada (${ticketTypes.map((t) => text(t.name) ?? text(t.id)).join(", ")})`);
  }

  // Only "on sale" is suggested: "not available" can mean sold out or not on sale yet, so that call stays the admin's.
  if (truthy(raw.tickets_available)) {
    fields.publicStatus = "tickets_available";
    imported.push("disponibilidad de entradas");
  }

  const venue = obj(raw.venue);
  const venueName = text(venue?.name);
  if (venueName) notes.push(`Lugar en Ticket Tailor: «${venueName}». No se copia: escribe tú la descripción pública del lugar.`);
  notes.push("El precio no se importa: escríbelo solo si quieres mostrarlo.");

  const all = ["título", "fecha", "hora de inicio", "hora de fin", "imagen", "enlace de compra", "tipos de entrada", "disponibilidad de entradas"];
  const missing = all.filter((f) => !imported.some((i) => i.startsWith(f)));
  missing.push("ciudad", "tipo de evento", "descripción para la web", "descripción pública del lugar");
  return { ticketTailorEventId, fields, imported, missing, notes, ticketTailorDescription };
}

export type ImportResult = { ok: true; value: TicketTailorImport } | { ok: false; error: "not_found" | "not_configured" | "request_failed"; detail?: string };

/** Reads one event from Ticket Tailor (read-only) and maps it for the form. */
export async function importTicketTailorEvent(ticketTailorEventId: string, pastedUrl: string | null): Promise<ImportResult> {
  let client;
  try {
    client = getTicketTailorClient();
  } catch {
    return { ok: false, error: "not_configured" };
  }
  try {
    // The API's event ids carry an "ev_" prefix; the public page shows the bare number.
    const raw = (await client.getEvent(`ev_${ticketTailorEventId}`)) ?? (await client.getEvent(ticketTailorEventId));
    if (!raw) return { ok: false, error: "not_found" };
    return { ok: true, value: mapTicketTailorEvent(ticketTailorEventId, raw, pastedUrl) };
  } catch (error) {
    return { ok: false, error: "request_failed", detail: error instanceof Error ? error.message : String(error) };
  }
}
