import "server-only";
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { resolveCity } from "@/lib/geo/places";
import {
  emptyClientProfile,
  type ClientPayment,
  type ClientProfileAnswers,
  type ClientView,
  type Programme,
} from "./types";
import { programmeEndFor, type ClientWritable } from "./validate";
import { PROGRAMMES } from "./types";

export const CLIENTS = "clients";

function iso(v: unknown): string | null {
  return v instanceof Timestamp ? v.toDate().toISOString() : null;
}

function mergeProfile(raw: Partial<ClientProfileAnswers> | undefined): ClientProfileAnswers {
  const empty = emptyClientProfile();
  return {
    visible: { ...empty.visible, ...raw?.visible },
    incomeRange: raw?.incomeRange ?? null,
    dealbreakers: { ...empty.dealbreakers, ...raw?.dealbreakers },
    preferences: { ...empty.preferences, ...raw?.preferences },
  };
}

export function toClientView(snap: DocumentSnapshot): ClientView {
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  const payment = (d.payment ?? {}) as Partial<ClientPayment>;
  return {
    id: snap.id,
    firstName: (d.firstName as string) ?? "",
    lastName: (d.lastName as string) ?? "",
    email: (d.email as string) ?? "",
    phone: (d.phone as string) ?? "",
    channel: (d.channel as ClientView["channel"]) ?? null,
    ageYears: (d.ageYears as number | null) ?? null,
    ageRecordedOn: (d.ageRecordedOn as string | null) ?? null,
    city: (d.city as string) ?? "",
    placeIne: (d.placeIne as string | null) ?? null,
    programme: (d.programme as Programme | null) ?? null,
    status: (d.status as ClientView["status"]) ?? "activo",
    programmeStart: (d.programmeStart as string | null) ?? null,
    programmeEnd: (d.programmeEnd as string | null) ?? null,
    payment: {
      status: payment.status ?? "pendiente",
      amountEur: payment.amountEur ?? null,
      method: payment.method ?? null,
      reference: payment.reference ?? "",
      paidOn: payment.paidOn ?? null,
    },
    profile: mergeProfile(d.profile as Partial<ClientProfileAnswers> | undefined),
    valuesInterests: (d.valuesInterests as string) ?? "",
    dealbreakersNotes: (d.dealbreakersNotes as string) ?? "",
    notes: (d.notes as string) ?? "",
    inquiryId: (d.inquiryId as string | null) ?? null,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
    createdBy: (d.createdBy as string | null) ?? null,
  };
}

export async function listClients(): Promise<ClientView[]> {
  const snap = await adminDb.collection(CLIENTS).orderBy("createdAt", "desc").get();
  return snap.docs.map(toClientView);
}

export async function getClient(id: string): Promise<ClientView | null> {
  if (!id || id.includes("/")) return null;
  const snap = await adminDb.collection(CLIENTS).doc(id).get();
  return snap.exists ? toClientView(snap) : null;
}

/**
 * Small conveniences applied on every save, so the page never has to:
 * the programme's end date and price follow its start date and programme
 * unless the team typed their own, and a typed city that names exactly one
 * municipality is placed automatically.
 */
function withDerived(current: ClientView | null, patch: Partial<ClientWritable>): Partial<ClientWritable> {
  const next = { ...patch };
  const programme = next.programme !== undefined ? next.programme : current?.programme ?? null;
  const start = next.programmeStart !== undefined ? next.programmeStart : current?.programmeStart ?? null;
  const startOrProgrammeChanged = next.programme !== undefined || next.programmeStart !== undefined;
  if (programme && start && startOrProgrammeChanged && next.programmeEnd === undefined) {
    next.programmeEnd = programmeEndFor(start, PROGRAMMES[programme].months);
  }
  if (next.programme && next.payment === undefined && current && current.payment.amountEur === null) {
    next.payment = { ...current.payment, amountEur: PROGRAMMES[next.programme].priceEur };
  }
  if (next.payment && next.payment.amountEur === null && programme) {
    next.payment = { ...next.payment, amountEur: PROGRAMMES[programme].priceEur };
  }
  if (next.city !== undefined && next.placeIne === undefined) {
    const r = resolveCity(next.city);
    next.placeIne = r.status === "resolved" ? r.place.ine : null;
  }
  return next;
}

export async function createClient(
  initial: Partial<ClientWritable> & { inquiryId?: string | null },
  createdBy: string,
  /** A fixed id makes creation idempotent: a second create with it fails instead of duplicating. */
  id?: string,
): Promise<ClientView> {
  const ref = id ? adminDb.collection(CLIENTS).doc(id) : adminDb.collection(CLIENTS).doc();
  const { inquiryId, ...rest } = initial;
  const data = withDerived(null, rest);
  const now = FieldValue.serverTimestamp();
  await ref.create({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    channel: null,
    ageYears: null,
    ageRecordedOn: null,
    city: "",
    placeIne: null,
    programme: null,
    status: "activo",
    programmeStart: null,
    programmeEnd: null,
    payment: { status: "pendiente", amountEur: null, method: null, reference: "", paidOn: null },
    profile: emptyClientProfile(),
    valuesInterests: "",
    dealbreakersNotes: "",
    notes: "",
    ...data,
    inquiryId: inquiryId ?? null,
    createdBy,
    createdAt: now,
    updatedAt: now,
  });
  return toClientView(await ref.get());
}

export async function updateClient(id: string, patch: Partial<ClientWritable>, updatedBy: string): Promise<ClientView | null> {
  const ref = adminDb.collection(CLIENTS).doc(id);
  const current = await getClient(id);
  if (!current) return null;
  await ref.update({ ...withDerived(current, patch), updatedBy, updatedAt: FieldValue.serverTimestamp() });
  return toClientView(await ref.get());
}
