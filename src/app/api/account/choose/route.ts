import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { routeAfterChoice } from "@/lib/account/route";
import { loadAccountState } from "@/lib/account/server";
import { isRequestedService, withProfileDefaults, type ProfileDocument } from "@/lib/introduction/types";

export const runtime = "nodejs";

/**
 * The explicit choice made on "Elige tu modalidad" (or on "Tu cuenta"):
 * the ONLY public-site action that creates an Introducciones profile.
 * One account keeps one profile: an existing profile is never replaced;
 * an unfinished one just records the newest choice, and a finished one is
 * left as it is (upgrading goes through the plan page).
 */
export async function POST(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  let body: { service?: unknown };
  try {
    body = (await request.json()) as { service?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  if (!isRequestedService(body.service)) {
    return NextResponse.json({ ok: false, error: "invalid_service" }, { status: 400 });
  }
  const service = body.service;
  const uid = auth.uid;
  const ref = adminDb.doc(`profiles/${uid}`);

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      const initial = withProfileDefaults(uid, {});
      tx.create(ref, {
        ...initial,
        meta: {
          ...initial.meta,
          requestedService: service,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
      return;
    }
    const existing = withProfileDefaults(uid, snap.data() as Partial<ProfileDocument>);
    if (!existing.meta.onboardingFinalized && existing.meta.requestedService !== service) {
      tx.update(ref, { "meta.requestedService": service, "meta.updatedAt": FieldValue.serverTimestamp() });
    }
  });

  const { profile, entitled } = await loadAccountState(uid);
  return NextResponse.json({ ok: true, route: routeAfterChoice({ profile: profile!, entitled, service }) });
}
