import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { withProfileDefaults, type ContactMethod, type ProfileDocument } from "@/lib/introduction/types";
import { isEligibleAge } from "@/lib/introduction/age";
import { resolvePersonId } from "@/lib/matching/identity";
import { eventParticipantId, normalizeEmail } from "./identifiers";
import { claimEventParticipant } from "./participants";
import { resolvePendingRequestsForActivatedParticipant } from "./requests";
import type { EventParticipantDocument } from "./types";

export interface ActivateReconnectParams {
  eventId: string;
  uid: string;
  verifiedEmail: string;
  /** Only used if the profile doesn't already have one — never overwrites an existing name. */
  firstName: string | null;
  /**
   * A Storage path already uploaded via the existing uploadPhoto() client
   * flow — never a raw file here. Entirely optional (see the product spec:
   * a photo must never be required to activate Reconnect) — only used if
   * the profile has zero photos and one was provided.
   */
  photoPath: string | null;
  /**
   * Whether this participant wants their photo (existing or freshly
   * uploaded, if any) shown in Reconnect for this event — stored on the
   * event participant record only, never touching ProfileDocument.photos
   * or Private Introductions. Meaningless (and ignored) when there ends up
   * being no photo at all.
   */
  showPhotoInReconnect: boolean;
  /** Optional — see the doc comment below on why age is not required for V1. */
  birthDateISO: string | null;
  contactMethod: ContactMethod | null;
  contactValue: string | null;
}

export type ActivateReconnectResult =
  | { ok: true }
  | { ok: false; error: "event_not_participant" | "claimed_by_other" | "under_minimum_age" | "missing_first_name" | "missing_contact_method" };

/**
 * The one write path for "activate Reconnect for this event" — deliberately
 * a single Admin-SDK server action, not a client Firestore write, even
 * though the SAME profile fields (firstName, photos, contactPreferences)
 * are already client-writable during normal onboarding. Two reasons: (1)
 * claiming the EventParticipant record must happen transactionally and
 * must never be client-writable at all (see firestore.rules), so a server
 * action was needed regardless; bundling the profile-field writes into the
 * SAME action keeps "activate" one atomic, defense-in-depth-checked step
 * rather than trusting several separate client writes to have already
 * happened correctly. (2) It lets this function INDEPENDENTLY verify the
 * minimum (name, photo, contact method) server-side before ever marking
 * the participant visible — never trusting the client's own claim that it
 * already collected them.
 *
 * Age is deliberately NOT required to activate Reconnect (see the actual
 * V1 minimum: first name, one photo, a contact method, consent) — but IF a
 * birth date is provided (the profile doesn't already have one), the
 * existing 35+ eligibility check still applies: Reconnect appearing in
 * front of Junto Select's 35+ audience must never let this become a way
 * around that floor. Someone who prefers not to give it yet is still
 * activatable; their card simply never shows an age.
 */
export async function activateReconnect(params: ActivateReconnectParams): Promise<ActivateReconnectResult> {
  const normalizedEmail = normalizeEmail(params.verifiedEmail);
  const participantRef = adminDb.doc(`eventParticipants/${eventParticipantId(params.eventId, normalizedEmail)}`);
  const profileRef = adminDb.doc(`profiles/${params.uid}`);

  const participantSnap = await participantRef.get();
  if (!participantSnap.exists) return { ok: false, error: "event_not_participant" };
  const participant = participantSnap.data() as EventParticipantDocument;
  if (participant.claimedUid && participant.claimedUid !== params.uid) {
    return { ok: false, error: "claimed_by_other" };
  }

  const profileSnap = await profileRef.get();
  const profile = withProfileDefaults(params.uid, (profileSnap.exists ? profileSnap.data() : {}) as Partial<ProfileDocument>);
  const personId = resolvePersonId(params.uid, profile);

  if (params.birthDateISO && !profile.private.birthDate) {
    if (!isEligibleAge(params.birthDateISO)) return { ok: false, error: "under_minimum_age" };
  }

  const finalFirstName = profile.visible.firstName || params.firstName?.trim() || "";
  if (!finalFirstName) return { ok: false, error: "missing_first_name" };

  // A photo is deliberately NOT required (see the product spec: activating
  // Reconnect must never require displaying a personal photo) — the profile
  // may legitimately end up with zero photos, in which case
  // discovery.ts's buildCandidateView renders a neutral placeholder for
  // this participant, exactly like an explicit showPhotoInReconnect: false.

  const finalContactMethod = profile.contactPreferences.preferredMethod ?? params.contactMethod;
  if (!finalContactMethod) return { ok: false, error: "missing_contact_method" };

  const now = FieldValue.serverTimestamp();
  const profileUpdate: Record<string, unknown> = { "meta.updatedAt": now };
  if (!profile.visible.firstName && params.firstName) {
    profileUpdate["visible.firstName"] = params.firstName.trim();
  }
  if (profile.photos.length === 0 && params.photoPath) {
    profileUpdate["photos"] = [params.photoPath];
    profileUpdate["meta.photosComplete"] = true;
  }
  if (!profile.private.birthDate && params.birthDateISO) {
    profileUpdate["private.birthDate"] = Timestamp.fromDate(new Date(`${params.birthDateISO}T00:00:00Z`));
  }
  if (!profile.contactPreferences.preferredMethod && params.contactMethod) {
    profileUpdate["contactPreferences.preferredMethod"] = params.contactMethod;
    if (params.contactValue) {
      if (params.contactMethod === "whatsapp" || params.contactMethod === "telefono") {
        profileUpdate["contactPreferences.phone"] = params.contactValue.trim();
      } else if (params.contactMethod === "instagram") {
        profileUpdate["contactPreferences.instagram"] = params.contactValue.trim();
      } else if (params.contactMethod === "linkedin") {
        profileUpdate["contactPreferences.linkedin"] = params.contactValue.trim();
      }
      // "email" needs no stored value — buildRevealedContacts already
      // resolves it from the Firebase Auth account email at reveal time.
    }
  }

  if (!profileSnap.exists) {
    // A brand-new profile — write the complete default shape first (never
    // a merge for a doc that doesn't exist yet), then apply the same
    // targeted dotted-path update below exactly as an existing profile
    // would get.
    await profileRef.set(profile);
  }
  if (Object.keys(profileUpdate).length > 1) {
    // Dotted-path keys ("visible.firstName") are only reliably interpreted
    // as nested field paths by `.update()` — a `.set(..., {merge:true})`
    // call would risk creating a literal field named "visible.firstName"
    // instead. Same pattern already used throughout this codebase (e.g.
    // legacyImport's claim.ts) for exactly this reason.
    await profileRef.update(profileUpdate);
  }

  const claim = await claimEventParticipant(params.eventId, params.verifiedEmail, params.uid, personId);
  if (!claim.ok) {
    // "not_found" can't actually happen here — this function already
    // confirmed the participant exists above — but map it defensively
    // rather than widen this function's own error union for a case that
    // should be structurally unreachable.
    return { ok: false, error: claim.error === "not_found" ? "event_not_participant" : claim.error };
  }

  await participantRef.update({
    visibleForReconnect: true,
    acceptsConnectionRequests: true,
    // Meaningless with zero photos, but harmless to store as-given —
    // buildCandidateView only ever consults it once there's an actual
    // profile.photos[0] to gate.
    showPhotoInReconnect: params.showPhotoInReconnect,
    activatedAt: now,
    updatedAt: now,
  });

  // Backfills recipientPersonId/recipientUid on any request sent to this
  // participant BEFORE they activated — see requests.ts's doc comment.
  // Never allowed to fail the activation itself if it errors.
  await resolvePendingRequestsForActivatedParticipant(claim.participantId, params.uid, personId).catch((error) => {
    console.error(`activateReconnect: failed to resolve pending requests for ${claim.participantId}`, error);
  });

  return { ok: true };
}
