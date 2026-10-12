import "server-only";
import { randomBytes } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import type { EligibleTicketTailorEventDocument } from "@/lib/eventBenefits/types";
import { validateEventInput } from "./editing";

/**
 * The admin Events Manager's writes. Events live in the existing
 * `eligibleTicketTailorEvents` collection, so one record drives the public
 * website, the 20 % member benefit and Reconnect — there is no second event
 * store. The doc id is the Ticket Tailor event number (as before); an event
 * created before tickets exist gets a `manual_…` id until its Ticket Tailor
 * link is added.
 */

const COLLECTION = "eligibleTicketTailorEvents";
const ref = (id: string) => adminDb.doc(`${COLLECTION}/${id}`);

export type SaveError =
  | "invalid"
  | "not_found"
  | "already_exists"
  | "ticket_tailor_change_not_allowed"
  | "event_in_use";

export type SaveResult = { ok: true; id: string } | { ok: false; error: SaveError; message: string };

/**
 * Creates (no `id`) or updates an event from the admin form.
 * `ticketTailorEventId` is the parsed number from a pasted Ticket Tailor
 * link, if any. Adding one to a manual event moves the record to the
 * Ticket Tailor number, which is only allowed while nothing (codes,
 * Reconnect data) points at the manual id.
 */
export async function saveEvent(
  id: string | null,
  ticketTailorEventId: string | null,
  raw: Record<string, unknown>,
  now: Date = new Date(),
): Promise<SaveResult> {
  const existingSnap = id ? await ref(id).get() : null;
  if (id && !existingSnap?.exists) return { ok: false, error: "not_found", message: "Este evento ya no existe." };
  const existing = existingSnap?.data() as EligibleTicketTailorEventDocument | undefined;
  const existingLinked = !!existing && existing.ticketTailorLinked !== false;

  if (existing && existingLinked && ticketTailorEventId && ticketTailorEventId !== id) {
    return {
      ok: false,
      error: "ticket_tailor_change_not_allowed",
      message: "Este evento ya está vinculado a otro evento de Ticket Tailor. Crea un evento nuevo para el otro enlace.",
    };
  }

  const linked = existingLinked || !!ticketTailorEventId;
  const parsed = validateEventInput(raw, linked);
  if (!parsed.ok) return { ok: false, error: "invalid", message: parsed.error };
  const input = parsed.value;

  const fields: Partial<EligibleTicketTailorEventDocument> = {
    ...input,
    ticketTailorLinked: linked,
    updatedAt: now,
    // A draft or finished event never stays on the website.
    ...(input.publicStatus === "draft" ? { published: false } : {}),
  };

  // New event.
  if (!existing) {
    const newId = ticketTailorEventId ?? `manual_${randomBytes(6).toString("hex")}`;
    const doc: EligibleTicketTailorEventDocument = {
      ...(fields as EligibleTicketTailorEventDocument),
      ticketTailorEventId: newId,
      createdAt: now,
      lastSyncedAt: null,
      lastSyncResult: null,
      reconnectForceClosedAt: null,
      published: false,
      publishedAt: null,
      archivedAt: null,
    };
    try {
      await ref(newId).create(doc);
    } catch {
      return {
        ok: false,
        error: "already_exists",
        message: "Este evento de Ticket Tailor ya está en la lista. Ábrelo desde la lista para editarlo.",
      };
    }
    return { ok: true, id: newId };
  }

  // Linking a manual event to Ticket Tailor: move it to the real id.
  if (!existingLinked && ticketTailorEventId) {
    const oldId = id as string;
    const inUse = await Promise.all(
      ["eventBenefits", "eventParticipants", "eventReconnectRequests"].map((c) =>
        adminDb.collection(c).where("ticketTailorEventId", "==", oldId).limit(1).get(),
      ),
    );
    if (inUse.some((s) => !s.empty)) {
      return { ok: false, error: "event_in_use", message: "Este evento ya tiene códigos o datos de Reconnect y no se puede volver a vincular." };
    }
    const moved = await adminDb.runTransaction(async (tx) => {
      const target = await tx.get(ref(ticketTailorEventId));
      if (target.exists) return false;
      tx.create(ref(ticketTailorEventId), { ...existing, ...fields, ticketTailorEventId });
      tx.delete(ref(oldId));
      return true;
    });
    if (!moved) {
      return {
        ok: false,
        error: "already_exists",
        message: "Ese evento de Ticket Tailor ya está en la lista como otro evento.",
      };
    }
    return { ok: true, id: ticketTailorEventId };
  }

  await ref(id as string).update(fields);
  return { ok: true, id: id as string };
}

export type PublishError = "not_found" | "not_ready" | "archived";

/** Shows or hides the event on the website. Only a dated, non-draft, non-finished event can be published. */
export async function setPublished(id: string, published: boolean, now: Date = new Date()): Promise<{ ok: true } | { ok: false; error: PublishError; message: string }> {
  const snap = await ref(id).get();
  if (!snap.exists) return { ok: false, error: "not_found", message: "Este evento ya no existe." };
  const e = snap.data() as EligibleTicketTailorEventDocument;
  if (published) {
    if (e.archivedAt) return { ok: false, error: "archived", message: "Restaura el evento antes de publicarlo." };
    const status = e.publicStatus ?? "draft";
    if (!e.eventDate || status === "draft" || status === "completed") {
      return {
        ok: false,
        error: "not_ready",
        message: "Para publicar, el evento necesita fecha y un estado: Próximamente, Entradas disponibles o Completo.",
      };
    }
  }
  await ref(id).update({ published, ...(published ? { publishedAt: now } : {}), updatedAt: now });
  return { ok: true };
}

/** Archiving hides the event everywhere (website and the member's list of events for this month's code). Nothing is deleted. */
export async function setArchived(id: string, archived: boolean, now: Date = new Date()): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const snap = await ref(id).get();
  if (!snap.exists) return { ok: false, error: "not_found" };
  await ref(id).update(archived ? { archivedAt: now, published: false, updatedAt: now } : { archivedAt: null, updatedAt: now });
  return { ok: true };
}

export async function getEventForAdmin(id: string): Promise<EligibleTicketTailorEventDocument | null> {
  const snap = await ref(id).get();
  return snap.exists ? (snap.data() as EligibleTicketTailorEventDocument) : null;
}
