import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { generatePresentationText } from "@/lib/ai/generatePresentation";
import { computeProfileStatus } from "@/lib/introduction/completion";
import type { ProfileDocument } from "@/lib/introduction/types";

export const runtime = "nodejs";

/**
 * No facts are accepted from the request body — everything the model sees
 * comes from this uid's own Firestore profile document, re-read here with
 * Admin privileges. That's deliberate: it's what makes "the AI may only
 * use facts the person actually provided" an enforced property rather
 * than a prompt-only hope — a client can't smuggle a fabricated fact into
 * the generation by sending it in the request.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!idToken) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const ref = adminDb.doc(`profiles/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 404 });
  }
  const profile = snap.data() as ProfileDocument;
  const prompts = profile.presentation?.prompts;

  if (!prompts?.freeTime?.trim() || !prompts?.values?.trim() || !prompts?.aboutYou?.trim()) {
    return NextResponse.json({ ok: false, error: "prompts_incomplete" }, { status: 400 });
  }

  let text: string;
  try {
    text = await generatePresentationText({
      firstName: profile.visible.firstName,
      gender: profile.visible.gender,
      city: profile.visible.city,
      profession: profile.visible.profession,
      activityLevel: profile.visible.activityLevel,
      prompts,
    });
  } catch (error) {
    console.error("Presentation generation failed:", error);
    return NextResponse.json({ ok: false, error: "generation_failed" }, { status: 502 });
  }

  const nextPresentation = {
    ...profile.presentation,
    generatedText: text,
    status: "draft" as const,
  };
  const profileStatus = computeProfileStatus({
    ...profile,
    presentation: nextPresentation,
  });

  await ref.update({
    "presentation.generatedText": text,
    "presentation.status": "draft",
    "meta.presentationComplete": false,
    "meta.profileStatus": profileStatus,
    "meta.updatedAt": new Date(),
  });

  return NextResponse.json({ ok: true, text });
}
