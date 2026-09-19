import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { emptyAboutMePrivate, emptyAboutMeVisible, emptyContactPreferences, emptyDealbreakers, emptyPreferences, emptyPresentation, type ProfileDocument } from "@/lib/introduction/types";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/versions";
import { legacyImportId } from "./mapping";
import type { LegacyImportDocument } from "./types";

export type ClaimLegacyContactResult =
  | { ok: true; alreadyClaimed: boolean }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "claimed_by_other" }
  | { ok: false; error: "existing_account" };

/**
 * The ONLY way a `legacyImports` doc is ever attached to a real
 * `profiles/{uid}` — server-side, transaction-safe, and driven ENTIRELY
 * by the caller's own server-verified authenticated email (`verifiedEmail`
 * below). There is deliberately no parameter anywhere in this function's
 * signature (or its caller, the API route) for a client-supplied email —
 * see the API route's own doc comment for why that's the actual security
 * boundary, not something enforced only here by convention.
 *
 * Every case handled explicitly, matching the spec's own required test
 * matrix:
 *  - No `legacyImports/{id}` doc for this email at all -> `not_found`.
 *  - Already claimed by a DIFFERENT uid -> `claimed_by_other` (a claim
 *    can never be stolen or re-pointed).
 *  - Already claimed by THIS SAME uid -> `alreadyClaimed: true`,
 *    idempotent no-op — critically, this does NOT re-run the prefill
 *    merge over `profiles/{uid}`, so a second call (e.g. a page refresh
 *    mid-onboarding) can never clobber answers the person has since
 *    edited.
 *  - `profiles/{uid}` already exists for this authenticated uid (this
 *    email already belongs to a real Junto Select account, whether from
 *    a normal Path A signup or an earlier legacy claim under a different
 *    row) -> `existing_account`; the real profile is never read into,
 *    written to, or overwritten, and the legacyImports doc is marked
 *    `collision` for admin visibility instead of silently disappearing.
 *  - Otherwise: create `profiles/{uid}` seeded from `prefill`, mark the
 *    legacyImports doc `claimed`.
 *
 * All of the above happens inside ONE transaction, so two concurrent
 * claim attempts (e.g. a double-clicked button, or two tabs) can never
 * both "win" and create two different outcomes.
 */
export async function claimLegacyContact(uid: string, verifiedEmail: string): Promise<ClaimLegacyContactResult> {
  const normalizedEmail = verifiedEmail.trim().toLowerCase();
  const id = legacyImportId(normalizedEmail);
  const legacyRef = adminDb.doc(`legacyImports/${id}`);
  const profileRef = adminDb.doc(`profiles/${uid}`);

  return adminDb.runTransaction(async (tx) => {
    const [legacySnap, profileSnap] = await Promise.all([tx.get(legacyRef), tx.get(profileRef)]);

    if (!legacySnap.exists) return { ok: false, error: "not_found" };
    const legacy = legacySnap.data() as LegacyImportDocument;

    if (legacy.claimedUid && legacy.claimedUid === uid) {
      return { ok: true, alreadyClaimed: true };
    }
    if (legacy.claimedUid && legacy.claimedUid !== uid) {
      return { ok: false, error: "claimed_by_other" };
    }

    if (profileSnap.exists) {
      // A real profile already exists for this authenticated uid — never
      // overwrite member-entered data with old Excel data. Flag for
      // admin visibility instead of silently dropping the row.
      const now = FieldValue.serverTimestamp();
      tx.update(legacyRef, {
        status: "collision",
        collisionUid: uid,
        updatedAt: now,
      });
      return { ok: false, error: "existing_account" };
    }

    const now = FieldValue.serverTimestamp();
    const { prefill } = legacy;

    const newProfile: ProfileDocument = {
      visible: {
        ...emptyAboutMeVisible,
        firstName: prefill.firstName ?? "",
        gender: prefill.gender,
        profession: prefill.profession ?? "",
        heightCm: prefill.heightCm,
        relationshipIntention: prefill.relationshipIntention,
      },
      private: { ...emptyAboutMePrivate },
      photos: [],
      dealbreakers: {
        ...emptyDealbreakers,
        ageMin: prefill.ageMin,
        ageMax: prefill.ageMax,
      },
      preferences: { ...emptyPreferences },
      presentation: { ...emptyPresentation },
      contactPreferences: {
        ...emptyContactPreferences,
        phone: prefill.phone,
      },
      meta: {
        onboardingStepIndex: 0,
        aboutMeComplete: false,
        photosComplete: false,
        preferencesComplete: false,
        presentationComplete: false,
        profileStatus: "draft",
        onboardingFinalized: false,
        personId: uid,
        searchStatus: "passive",
        duplicateStatus: "clear",
        duplicateOf: null,
        pendingLegacyActivation: true,
        legacyImportId: id,
        matchingAnchorAt: null,
        matchingSubscriptionId: null,
        matchingPeriodsProcessed: 0,
        nextMatchingDueAt: null,
        createdAt: now,
        updatedAt: now,
      },
    };

    tx.set(profileRef, newProfile);
    tx.update(legacyRef, {
      status: "claimed",
      claimedUid: uid,
      claimedPersonId: uid,
      claimedAt: now,
      updatedAt: now,
    });

    return { ok: true, alreadyClaimed: false };
  });
}

export type AcceptLegacyTermsResult = { ok: true } | { ok: false; error: "not_found" | "not_claimed_by_you" };

/**
 * Records the person's explicit acknowledgment of the CURRENT legal
 * documents on their `legacyImports` doc before they proceed into
 * onboarding — see the final report for why this is an ADDITIONAL,
 * explicit checkpoint layered onto this activation flow specifically,
 * rather than a new, stronger gate applied retroactively to normal Path A
 * signups (which have no equivalent standalone step today; their only
 * existing legal-acceptance touchpoint is Stripe checkout). Uses the same
 * `CURRENT_TERMS_VERSION`/`CURRENT_PRIVACY_VERSION` constants as billing
 * checkout — never a fabricated "they already agreed back then" claim
 * about the original old-form submission.
 */
export async function acceptLegacyTerms(uid: string, verifiedEmail: string): Promise<AcceptLegacyTermsResult> {
  const normalizedEmail = verifiedEmail.trim().toLowerCase();
  const id = legacyImportId(normalizedEmail);
  const legacyRef = adminDb.doc(`legacyImports/${id}`);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(legacyRef);
    if (!snap.exists) return { ok: false, error: "not_found" };
    const legacy = snap.data() as LegacyImportDocument;
    if (legacy.claimedUid !== uid) return { ok: false, error: "not_claimed_by_you" };

    tx.update(legacyRef, {
      activationConsent: {
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
        acceptedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  });
}
