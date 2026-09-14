import type { Timestamp } from "firebase/firestore";

export type Gender = "mujer" | "hombre";

export type EducationLevel =
  | "formacion_profesional"
  | "universidad"
  | "master_doctorado"
  | "prefiero_no_decirlo";

export type IncomeRange =
  | "menos_40k"
  | "40k_80k"
  | "80k_150k"
  | "mas_150k"
  | "prefiero_no_decirlo";

export type RelationshipIntention =
  | "relacion_seria"
  | "matrimonio_familia"
  | "aun_no_lo_tengo_claro";

export type FrequencyLevel = "no" | "socialmente" | "habitualmente";

export type ActivityLevel =
  | "muy_activo"
  | "activo"
  | "ocasional"
  | "poco_activo";

export type DistancePreference = "misma_ciudad" | "hasta_50km" | "sin_limite";

export type FutureChildrenPreference = "si" | "no" | "indiferente";

/**
 * Simplified partner requirement: does it matter to this person whether a
 * candidate has a child under 15? `true` ("Sí") is a genuine hard
 * dealbreaker — a candidate with a child under 15 is excluded outright
 * (see hardFilters.ts acceptsYoungChildren). `false` ("No") means it never
 * excludes anyone on this basis. There is deliberately no separate
 * "has children at all" question or partner requirement anymore — a
 * candidate whose children are all 15+ always passes (see the product
 * simplification this replaced: an earlier 3-tier `ChildrenAcceptance`
 * model, and before that a general "accepts a partner with children"
 * dealbreaker, both removed as unnecessary complexity — see
 * normalizeYoungChildrenMatters for how old data maps onto this).
 */

/**
 * Backward-compatible read-side normalizer for the young-children partner
 * requirement, now stored as `dealbreakers.partnerYoungChildrenMatters`.
 * Reads BOTH the current field name and, when absent, the field name(s)
 * used by earlier implementations, so old documents never crash and never
 * silently disappear as "unanswered" when they do carry real prior intent:
 *
 * - Current format (`newValue`): already a plain boolean — used as-is.
 * - Original pre-simplification format (`legacyValue` as a raw boolean,
 *   under the old field name `partnerHasYoungChildrenOk`): `true` meant
 *   "No me importaría" (accepts) -> now `false` (doesn't matter); `false`
 *   meant "Prefiero que no" (an absolute reject at the time) -> now `true`
 *   (matters) — this is the field's ORIGINAL meaning before any
 *   experimentation, so reviving it isn't "stricter than previously
 *   expressed," it's the most faithful available reading.
 * - Short-lived 3-tier format (`legacyValue` as a string, same old field
 *   name): `"no_acepto"` was an explicit hard dealbreaker -> `true`.
 *   `"no_me_importa"` and `"prefiero_que_no"` were BOTH explicitly
 *   non-hard-excluding under that model (only `no_acepto` ever excluded a
 *   candidate) -> both map to `false`, so no profile is retroactively
 *   made stricter than the most recent semantics it was actually shown.
 * - Missing/malformed in both places -> `null` (unanswered), the same
 *   fail-closed "unknown" state hard filters already treat correctly.
 */
export function normalizeYoungChildrenMatters(newValue: unknown, legacyValue: unknown): boolean | null {
  if (newValue === true || newValue === false) return newValue;
  if (legacyValue === true) return false;
  if (legacyValue === false) return true;
  if (legacyValue === "no_acepto") return true;
  if (legacyValue === "no_me_importa" || legacyValue === "prefiero_que_no") return false;
  return null;
}

/**
 * Self-reported intent, distinct from FutureChildrenPreference above (a
 * dealbreaker about a *partner's* answer) — "indiferente" doesn't make
 * sense as a description of one's own desire, so this is a separate type
 * with "no_lo_se" instead.
 */
export type FutureChildrenIntention = "si" | "no" | "no_lo_se";

/**
 * V1 scope is Madrid-only, but this is deliberately not a Madrid-specific
 * field name: `market` names WHICH market a profile is evaluated against
 * ("madrid" is the only value that exists today), and `MarketAvailability`
 * is generic across any market. Adding a second market later means a new
 * value for `market`, not a new field or a schema migration.
 */
export type Market = "madrid";

export type MarketAvailability =
  | "lives_in_market"
  | "lives_near_market"
  | "frequent_visitor"
  | "not_regular_in_market";

/**
 * "Lo que buscas" — matching criteria, split the same way the product
 * distinguishes them: `dealbreakers` are hard filters (a mismatch means
 * the matching engine should never suggest the pair), `preferences` are
 * soft signals for compatibility scoring only, never a hard exclusion.
 */
export interface Dealbreakers {
  gendersSought: Gender[];
  ageMin: number | null;
  ageMax: number | null;
  maxDistance: DistancePreference | null;
  relationshipIntentionsAccepted: RelationshipIntention[];
  smokingAccepted: FrequencyLevel[];
  // Deliberately the ONLY children-related partner requirement — there is
  // no general "accepts a partner with any children" question anymore
  // (a candidate whose children are all 15+ always passes; see
  // hardFilters.ts acceptsYoungChildren). See normalizeYoungChildrenMatters
  // above for how legacy field names/values map onto this.
  partnerYoungChildrenMatters: boolean | null;
  partnerWantsFutureChildren: FutureChildrenPreference | null;
}

export interface Preferences {
  heightMinCm: number | null;
  heightMaxCm: number | null;
  drinkingAccepted: FrequencyLevel[];
  activityLevelsPreferred: ActivityLevel[];
}

export const emptyDealbreakers: Dealbreakers = {
  gendersSought: [],
  ageMin: null,
  ageMax: null,
  maxDistance: null,
  relationshipIntentionsAccepted: [],
  smokingAccepted: [],
  partnerYoungChildrenMatters: null,
  partnerWantsFutureChildren: null,
};

export const emptyPreferences: Preferences = {
  heightMinCm: null,
  heightMaxCm: null,
  drinkingAccepted: [],
  activityLevelsPreferred: [],
};

/**
 * "Tu presentación" — a handful of short prompts, used only as factual
 * grounding for an AI-generated introduction the person then reviews,
 * edits, and explicitly approves. `generatedText` is written server-side
 * (by the generation endpoint, from Firestore data only); `approvedText`
 * is what the person actually approved, and may differ from
 * `generatedText` if they edited it before approving.
 */
export interface PresentationPrompts {
  freeTime: string;
  values: string;
  aboutYou: string;
}

export type PresentationStatus = "not_started" | "draft" | "approved";

export interface PresentationDocument {
  prompts: PresentationPrompts;
  generatedText: string | null;
  approvedText: string | null;
  status: PresentationStatus;
}

export const emptyPresentation: PresentationDocument = {
  prompts: { freeTime: "", values: "", aboutYou: "" },
  generatedText: null,
  approvedText: null,
  status: "not_started",
};

export type ContactMethod = "whatsapp" | "telefono" | "email" | "instagram" | "linkedin";

/**
 * How this person prefers to be reached — strictly private account data,
 * never shown on ProfileCard or to another member. Intended only for a
 * future contact-reveal step after a mutual introduction is accepted;
 * that reveal logic doesn't exist yet, this is just the data.
 *
 * No separate contact email field on purpose: the account's
 * authenticated email (already on the Firebase Auth user, mirrored to
 * `users/{uid}`) is what "Email" as a method means — adding a second
 * email here would just be data to keep in sync for no benefit.
 */
export interface ContactPreferences {
  preferredMethod: ContactMethod | null;
  additionalMethods: ContactMethod[];
  // Shared by "whatsapp" and "telefono" — one real-world phone number,
  // not two fields that could disagree with each other.
  phone: string | null;
  instagram: string | null;
  linkedin: string | null;
}

export const emptyContactPreferences: ContactPreferences = {
  preferredMethod: null,
  additionalMethods: [],
  phone: null,
  instagram: null,
  linkedin: null,
};

/**
 * "About me" — Step 1 of the Junto Select Introduction profile.
 *
 * Split into `visible` (would be shown to a matched candidate, once
 * matching exists) and `private` (matching-only, never displayed to
 * another member) from day one, so later stages don't need a schema
 * migration to introduce that distinction.
 */
export interface AboutMeVisible {
  firstName: string;
  gender: Gender | null;
  city: string;
  profession: string;
  educationLevel: EducationLevel | null;
  heightCm: number | null;
  languages: string[];
  hasChildren: boolean | null;
  childrenCount: number | null;
  // One entry per child, birth YEAR only — never a full birth date, and
  // never a static "age" that would go stale. Whether any child is under
  // a given age threshold (e.g. 15, for the partnerYoungChildrenMatters
  // dealbreaker) is always DERIVED from this at the moment it's needed
  // (see src/lib/introduction/age.ts) — there is no separate stored
  // "under 15" flag to ever fall out of sync with this data. Only
  // meaningful when hasChildren === true; null means not yet answered.
  childrenBirthYears: number[] | null;
  wantsFutureChildren: FutureChildrenIntention | null;
  relationshipIntention: RelationshipIntention | null;
  smoking: FrequencyLevel | null;
  drinking: FrequencyLevel | null;
  activityLevel: ActivityLevel | null;
  // Always "madrid" for V1 — a constant, not something anyone answers.
  // See Market's doc comment for why this exists as a field at all.
  market: Market;
  marketAvailability: MarketAvailability | null;
}

export interface AboutMePrivate {
  birthDate: Timestamp | null;
  incomeRange: IncomeRange | null;
}

export type ProfileStatus = "draft" | "active_for_matching";

/**
 * Whether this person's own monthly matching cycle runs at all.
 * `passive`: can still be selected as a CANDIDATE for someone else's
 * cycle, but never receives their own proposals. `active_search`: can be
 * selected AND receives up to 3 proposals per monthly cycle. Everyone
 * defaults to `passive` — there is no Stripe integration yet, so this must
 * never be inferred from profile completeness or set true automatically.
 * It is flipped to `active_search` only by an explicit allowlist entry
 * today, and by a future billing webhook once Stripe exists.
 */
export type SearchStatus = "passive" | "active_search";

/**
 * See README "Duplicate accounts / profile integrity" for the full
 * architecture. `clear`: normal eligibility. `suspected`: excluded BOTH as
 * a proposal recipient AND as a candidate for others, until a human
 * resolves it — the priority is never letting the same probable real
 * person occupy two slots in the matching pool. `confirmed_duplicate`:
 * fully excluded, permanently, until (if ever) resolved. `resolved`:
 * back to normal eligibility. Never set to `confirmed_duplicate`
 * automatically from a heuristic alone — that transition is a human
 * decision informed by `duplicateCandidates`.
 */
export type DuplicateStatus =
  | "clear"
  | "suspected"
  | "confirmed_duplicate"
  | "resolved";

export interface ProfileDocument {
  visible: AboutMeVisible;
  private: AboutMePrivate;
  photos: string[];
  dealbreakers: Dealbreakers;
  preferences: Preferences;
  presentation: PresentationDocument;
  contactPreferences: ContactPreferences;
  meta: {
    onboardingStepIndex: number;
    aboutMeComplete: boolean;
    photosComplete: boolean;
    preferencesComplete: boolean;
    presentationComplete: boolean;
    profileStatus: ProfileStatus;
    // True only once the person has explicitly pressed "Guardar y
    // finalizar" on the Review screen — never inferred merely from every
    // section having data. This is what distinguishes "eligible" from
    // "actually reviewed and confirmed" in Profile Home's messaging.
    onboardingFinalized: boolean;
    // The unique-person identity this profile resolves to. Defaults to
    // this profile's own uid (the common case — one person, one account).
    // Only differs from uid once an admin merge links a second/duplicate
    // account to a primary one (see src/lib/matching/identity.ts) — the
    // matching engine always groups by personId, never by raw uid, so
    // that a person who accidentally created two accounts can never
    // occupy two slots in the pool.
    personId: string;
    searchStatus: SearchStatus;
    duplicateStatus: DuplicateStatus;
    // Set only when duplicateStatus is confirmed_duplicate (or was, before
    // being resolved) — the uid of the account this one was merged into.
    duplicateOf: string | null;
    /**
     * Per-member matching-cycle anchor (added for the per-member-anniversary
     * matching model — see src/lib/matching/dueScheduler.ts). Written ONLY
     * by the Stripe webhook, from `subscription.start_date` — immutable for
     * the life of one continuous subscription, which is exactly "when did
     * this member's matching month start." Never touched by onboarding or
     * any other client write path; protected from client writes the same
     * way `searchStatus` already is (firestore.rules).
     */
    matchingAnchorAt: unknown | null;
    /**
     * The Stripe subscription id `matchingAnchorAt`/`matchingPeriodsProcessed`
     * belong to. Lets the webhook tell "just a renewal/status update on the
     * SAME subscription" (leave the anchor and counter alone) apart from
     * "a genuinely NEW subscription" (a fresh signup, or a resubscription
     * after full cancellation — reset the anchor and counter to start this
     * member's matching clock over).
     */
    matchingSubscriptionId: string | null;
    /**
     * How many monthly matching periods have been completed for the
     * CURRENT subscription. Periods are always derived from
     * `matchingAnchorAt + matchingPeriodsProcessed` clamped months —
     * never by repeatedly adding "+1 month" to a previous (possibly
     * already clamped) due date, which would drift. Starts at 0, meaning
     * the first period is due immediately (matchingAnchorAt + 0 months).
     */
    matchingPeriodsProcessed: number;
    /**
     * Derived from the two fields above, but also STORED so it can be
     * queried directly ("who is due right now") — Firestore can't filter
     * on a computed expression. Recomputed and rewritten every time
     * `matchingPeriodsProcessed` advances; never hand-edited independently
     * of it.
     */
    nextMatchingDueAt: unknown | null;
    createdAt: unknown;
    updatedAt: unknown;
  };
}

export const emptyAboutMeVisible: AboutMeVisible = {
  firstName: "",
  gender: null,
  city: "",
  profession: "",
  educationLevel: null,
  heightCm: null,
  languages: [],
  hasChildren: null,
  childrenCount: null,
  childrenBirthYears: null,
  wantsFutureChildren: null,
  relationshipIntention: null,
  smoking: null,
  drinking: null,
  activityLevel: null,
  market: "madrid",
  marketAvailability: null,
};

export const emptyAboutMePrivate: AboutMePrivate = {
  birthDate: null,
  incomeRange: null,
};

/**
 * Backfills sub-objects/fields a raw Firestore document predates (added to
 * the schema after that profile was first written) with their empty
 * defaults, the same shallow-merge contract as the client-side onboarding
 * read path (src/lib/introduction/profile.ts's withDefaults) — a legacy
 * document simply never had `preferences`, say, so it gets `emptyPreferences`
 * rather than `undefined`. Pure and framework-agnostic (no Firestore/client
 * imports) so both the client onboarding path and server-side matching
 * engine (which reads raw docs directly, not through getOrCreateProfile)
 * can normalize a candidate/recipient the same way before any hard-filter
 * or scoring code touches it — see engine.ts loadEligiblePool.
 */
export function withProfileDefaults(
  uid: string,
  data: Partial<ProfileDocument>,
): ProfileDocument {
  return {
    visible: { ...emptyAboutMeVisible, ...data.visible },
    private: { ...emptyAboutMePrivate, ...data.private },
    photos: data.photos ?? [],
    dealbreakers: {
      ...emptyDealbreakers,
      ...data.dealbreakers,
      // Backward compatibility: normalize every prior format (the
      // original boolean, and the short-lived 3-tier string) into the
      // current simple boolean on every read — see
      // normalizeYoungChildrenMatters's own doc comment. This is the ONLY
      // place the matching engine's raw Firestore reads need to change to
      // safely understand all three formats; hardFilters.ts only ever
      // sees the normalized current value. The old field name is read via
      // a loose cast since it no longer exists on Dealbreakers.
      partnerYoungChildrenMatters: normalizeYoungChildrenMatters(
        (data.dealbreakers as Record<string, unknown> | undefined)?.partnerYoungChildrenMatters,
        (data.dealbreakers as Record<string, unknown> | undefined)?.partnerHasYoungChildrenOk,
      ),
    },
    preferences: { ...emptyPreferences, ...data.preferences },
    presentation: {
      ...emptyPresentation,
      ...data.presentation,
      prompts: { ...emptyPresentation.prompts, ...data.presentation?.prompts },
    },
    contactPreferences: { ...emptyContactPreferences, ...data.contactPreferences },
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
      matchingAnchorAt: null,
      matchingSubscriptionId: null,
      matchingPeriodsProcessed: 0,
      nextMatchingDueAt: null,
      createdAt: null,
      updatedAt: null,
      ...data.meta,
    },
  };
}
