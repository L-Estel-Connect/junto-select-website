import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { InquiryStatus } from "@/lib/matchmaking/inquiry";

/** One matchmaking application as the admin list shows it. */
export interface InquiryRow {
  id: string;
  createdAt: string | null;
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  canal: string;
  edad: number | null;
  ciudad: string;
  programa: string;
  objetivo: string;
  edadDesde: number | null;
  edadHasta: number | null;
  busca: string;
  status: InquiryStatus;
  note: string;
  statusUpdatedBy: string | null;
  notificationQueueError: string | null;
}

function isoOrNull(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : null);

export async function listInquiries(): Promise<InquiryRow[]> {
  const snap = await adminDb.collection("matchmakingInquiries").orderBy("createdAt", "desc").limit(1000).get();
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      createdAt: isoOrNull(x.createdAt),
      nombre: str(x.nombre),
      apellidos: str(x.apellidos),
      email: str(x.email),
      telefono: str(x.telefono),
      canal: str(x.canal),
      edad: num(x.edad),
      ciudad: str(x.ciudad),
      programa: str(x.programa),
      objetivo: str(x.objetivo),
      edadDesde: num(x.edadDesde),
      edadHasta: num(x.edadHasta),
      busca: str(x.busca),
      status: (str(x.status) || "nueva") as InquiryStatus,
      note: str(x.note),
      statusUpdatedBy: typeof x.statusUpdatedBy === "string" ? x.statusUpdatedBy : null,
      notificationQueueError: typeof x.notificationQueueError === "string" ? x.notificationQueueError : null,
    };
  });
}
