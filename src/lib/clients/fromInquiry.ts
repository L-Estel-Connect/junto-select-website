import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { emptyClientProfile, type ClientView } from "./types";
import { CLIENTS, createClient, getClient, toClientView } from "./store";

/**
 * "Convertir en cliente": a request from the /matchmaking form becomes a
 * client, carrying over everything it already says (name, contact,
 * programme, age, city, the age range sought, the relationship they want,
 * and their own words as a note). The request is marked "Cliente" and
 * linked, so converting it twice opens the same client instead. A client
 * that already exists with the same email is linked rather than duplicated.
 * The request itself is kept, unchanged apart from the link, for history.
 */

const OBJECTIVE_TO_INTENTION: Record<string, "relacion_seria" | "aun_no_lo_tengo_claro"> = {
  relacion_estable: "relacion_seria",
  compromiso: "relacion_seria",
  definiendo: "aun_no_lo_tengo_claro",
};

export async function clientFromInquiry(
  inquiryId: string,
  adminEmail: string,
): Promise<{ client: ClientView; created: boolean } | null> {
  if (!inquiryId || inquiryId.includes("/")) return null;
  const ref = adminDb.collection("matchmakingInquiries").doc(inquiryId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const x = snap.data() as Record<string, unknown>;

  if (typeof x.clientId === "string") {
    const existing = await getClient(x.clientId);
    if (existing) return { client: existing, created: false };
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const num = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
  const profile = emptyClientProfile();
  const intention = OBJECTIVE_TO_INTENTION[str(x.objetivo)] ?? null;
  profile.visible.relationshipIntention = intention;
  const ageMin = num(x.edadDesde);
  const ageMax = num(x.edadHasta);
  profile.dealbreakers.ageMin = ageMin !== null && ageMin >= 18 && ageMin <= 99 ? ageMin : null;
  profile.dealbreakers.ageMax = ageMax !== null && ageMax >= 18 && ageMax <= 99 ? ageMax : null;
  const age = num(x.edad);
  const programme = str(x.programa);
  const channel = str(x.canal);
  const busca = str(x.busca);

  const id = `solicitud_${inquiryId}`;
  const already = await getClient(id);
  if (already) {
    await linkInquiry(ref, already.id, adminEmail);
    return { client: already, created: false };
  }
  const email = str(x.email).toLowerCase();
  if (email) {
    const sameEmail = await adminDb.collection(CLIENTS).where("email", "==", email).limit(1).get();
    if (!sameEmail.empty) {
      const existing = toClientView(sameEmail.docs[0]);
      await linkInquiry(ref, existing.id, adminEmail);
      return { client: existing, created: false };
    }
  }
  const client = await createClient(
    {
      firstName: str(x.nombre),
      lastName: str(x.apellidos),
      email,
      phone: str(x.telefono),
      channel: channel === "whatsapp" || channel === "llamada" || channel === "email" ? channel : null,
      ageYears: age !== null && age >= 18 && age <= 99 ? age : null,
      ageRecordedOn: age !== null ? new Date().toISOString().slice(0, 10) : null,
      city: str(x.ciudad),
      programme: programme === "select" || programme === "privado" ? programme : null,
      profile,
      notes: busca ? `En su solicitud: «${busca}»` : "",
      inquiryId,
    },
    adminEmail,
    id,
  ).catch(async (error) => {
    // Two clicks at once: the second create finds the first one's client.
    const raced = await getClient(id);
    if (raced) return raced;
    throw error;
  });

  await linkInquiry(ref, client.id, adminEmail);
  return { client, created: true };
}

async function linkInquiry(ref: FirebaseFirestore.DocumentReference, clientId: string, adminEmail: string) {
  await ref.update({
    clientId,
    status: "cliente",
    statusUpdatedBy: adminEmail,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
