import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireFirebaseUser } from "@/lib/firebase/serverAuth";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/versions";
import { hasUsablePhone } from "@/lib/introduction/phone";

export const runtime = "nodejs";

/**
 * Records a person's explicit consent to take part in private
 * Introductions (to be proposed to compatible people, with contact shared
 * only on mutual acceptance), together with the terms/privacy versions they
 * accepted. Additive only: it is written when someone finalizes a profile,
 * and nothing in matching reads or gates on it, so existing profiles and
 * matching rules are unchanged. Free participants had no such record before;
 * paid members only had the checkout terms acceptance on billing/{uid}.
 */
export async function POST(request: Request) {
  const auth = await requireFirebaseUser(request);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  if ((body as { introductionsConsent?: unknown })?.introductionsConsent !== true) {
    return NextResponse.json({ ok: false, error: "consent_required" }, { status: 400 });
  }

  // New registrations finish with a phone the team can use. Profiles that
  // were already finalized are never held to it.
  const profileSnap = await adminDb.doc(`profiles/${auth.uid}`).get();
  if (profileSnap.get("meta.onboardingFinalized") !== true && !hasUsablePhone(profileSnap.get("contactPreferences.phone"))) {
    return NextResponse.json({ ok: false, error: "phone_required" }, { status: 400 });
  }

  await adminDb.collection("introductionsConsent").doc(auth.uid).set(
    {
      uid: auth.uid,
      introductionsConsent: true,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
      acceptedAt: FieldValue.serverTimestamp(),
      source: "profile_finalize",
    },
    { merge: true },
  );
  return NextResponse.json({ ok: true });
}
