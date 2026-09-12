"use client";

import { updateProfileFields } from "./profile";
import { computeProfileStatus } from "./completion";
import type { PresentationPrompts, ProfileDocument } from "./types";

export async function savePresentationPrompts(
  uid: string,
  prompts: PresentationPrompts,
): Promise<void> {
  await updateProfileFields(
    uid,
    { "presentation.prompts": prompts },
    {},
  );
}

/**
 * Persists the person's explicit approval of the generated text (possibly
 * edited by them first). This is the only step that ever counts as
 * "presentation complete" — a generated draft that was never approved
 * does not count, by design.
 */
export async function approvePresentation(
  uid: string,
  approvedText: string,
  profile: ProfileDocument,
): Promise<void> {
  const nextPresentation = {
    ...profile.presentation,
    approvedText,
    status: "approved" as const,
  };
  const profileStatus = computeProfileStatus({
    ...profile,
    presentation: nextPresentation,
  });
  await updateProfileFields(
    uid,
    {
      "presentation.approvedText": approvedText,
      "presentation.status": "approved",
    },
    { presentationComplete: true, profileStatus },
  );
}
