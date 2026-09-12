# Junto Select — website

The Junto Select events landing page, built with Next.js (App Router) +
TypeScript + Tailwind CSS. Single page for now; structured so
`/introductions` and other pages can be added later without rework.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. `npm run build` / `npm run start` for a
production build, `npm run lint` for ESLint + TypeScript checks.

## Project structure

```
src/
  app/
    page.tsx              the landing page (composes the sections below)
    layout.tsx             root layout, fonts, global <head> metadata
    globals.css             design tokens (colors, base styles) for Tailwind v4
    robots.ts, sitemap.ts   generated SEO files
    opengraph-image.tsx     generated typographic OG/share image
    icon.tsx                generated placeholder favicon (see ASSETS.md)
    api/invitation/route.ts server-side route that calls Brevo
    introduction/
      page.tsx               public sign-in landing (Google / email link)
      onboarding/page.tsx    protected "About me" onboarding wizard — the
                             only page still under /introduction once an
                             account exists; see "Information architecture"
    member/                  the authenticated product, once About Me is
                             done — see "Member area" below for the full
                             route list
    privacidad/, terminos/  minimal placeholder legal pages (no real legal
                             text yet — see Privacy notes)
    api/introduction/
      generate-presentation/route.ts  server route, calls the Anthropic API
  components/               one component per section, plus shared bits
    Hero.tsx, WhoYouMeet.tsx, PrivateSection.tsx, InvitationSection.tsx,
    Footer.tsx, Wordmark.tsx, Section.tsx
    InvitationForm.tsx      the native application form (client component)
    introduction/            AuthButtons, ConfirmEmailForLink, IneligibleAge,
                             RequireIntroductionAuth (shared auth guard, used
                             only by /introduction/onboarding now),
                             OnboardingWizard, StepQuestion (Step 1),
                             PreferencesSection, PreferenceFields,
                             PhotosSection, PrivatePhotoThumbnail,
                             PresentationSection, ContactSection,
                             MemberProfileSection (view + finalize + edit
                             hub), ProfileCard (the actual rendered profile,
                             reused by MemberProfileSection in both modes)
    member/                  MemberShell (auth guard + nav for /member/**),
                             MemberNav, MemberContext (uid via context),
                             useMemberProfile (fetch + finalized guard),
                             MemberHome, ProposalsSection, ConnectionsSection,
                             PlanSection, SettingsSection
  lib/
    brevo.ts                server-only Brevo API call
    types.ts, validation.ts shared between the form and the API route
    styles.ts               a couple of shared Tailwind class strings
    firebase/                client.ts (SDK init), admin.ts (server-only,
                             Admin SDK), auth.ts, useAuth.ts
    ai/generatePresentation.ts  server-only Anthropic API call + prompt
    introduction/            aboutMeFields.ts (Step 1 field config), types.ts,
                             profile.ts (Firestore access), age.ts,
                             completion.ts (section/eligibility logic +
                             the onboarding route resolver), photos.ts,
                             imageProcessing.ts, preferences.ts,
                             presentation.ts, contact.ts (contact
                             preferences + validation)
ASSETS.md                   what photography/logo is still needed, and where
firestore.rules             Firestore Security Rules (owner-only + age gate)
storage.rules                Storage Security Rules (owner-only photo access)
firebase.json, .firebaserc  Firebase project/emulator config
```

## Information architecture

Two namespaces, split by a single event — has this profile been
finalized:

- **`/introduction/*`** — pre-account and first-time setup only: the
  public sign-in landing (`/introduction`) and the "About me" wizard
  (`/introduction/onboarding`). Nothing else lives here anymore.
- **`/member/*`** — the authenticated product, for anyone who has an
  account, whether or not they've finished onboarding yet. Editing a
  section (Lo que buscas, Fotos, Tu presentación, Contacto) and viewing
  the assembled profile happen at the *same* URLs before and after
  finalization — there's deliberately no separate "setup" copy of these
  pages and a different "editing" copy later.

Full `/member` route list:

| Route | Purpose |
|---|---|
| `/member` | Member Home — status + "Ver mi perfil" / "Editar mi perfil" |
| `/member/profile` | The assembled profile (`ProfileCard`) — pre-finalize this is "Así se verá tu perfil" with "Guardar y finalizar"; after, it's "Ver mi perfil" plus the "Editar mi perfil" section-list lower on the same page (`#editar-perfil`) |
| `/member/profile/preferences` | "Lo que buscas" — edit dealbreakers/preferences |
| `/member/profile/photos` | "Fotos" |
| `/member/profile/presentation` | "Tu presentación" |
| `/member/profile/contact` | "¿Cómo prefieres que te contacten?" — private contact preferences |
| `/member/proposals` | "Mis propuestas" — empty-state shell for future introductions |
| `/member/connections` | "Conexiones" — empty-state shell for future mutual connections |
| `/member/plan` | "Mi plan" — placeholder membership/billing status |
| `/member/settings` | "Ajustes" — account, privacy/legal links, sign out, delete-profile placeholder |

Why not keep everything at the old `/introduction/*` URLs (which is what
this repo did before this pass)? Because "onboarding" and "the product
you use afterward" are different things, and a permanent product living
under URLs named for a one-time setup flow reads as exactly the kind of
"confusing collection of onboarding URLs" this restructuring was asked to
avoid. The one-time, not-yet-an-account parts (sign-in, About Me) stay at
`/introduction/*`; everything that exists for the life of the account
moved to `/member/*`, with one page per concern and no duplicate
view/edit copies of anything.

## Assets

Real photography is in place for all three slots (`public/images/hero.png`,
`who-you-meet.png`, `private-curated.png`), rendered via `next/image`. See
`ASSETS.md` — the logo mark itself is still a styled-text stand-in.

## Brevo configuration required

The form posts to `POST /api/invitation`, which calls the Brevo Contacts
API server-side (`src/lib/brevo.ts`) — the API key never reaches the
browser.

1. Set `BREVO_API_KEY` in your deployment environment (see
   `.env.example`). Without it the route returns a `503` and the form shows
   a graceful error — this is expected until the key is configured.
2. Optionally set `BREVO_LIST_ID` to attach new contacts to a specific
   Brevo list. Without it, contacts are still created/updated in Brevo,
   just without a list.
3. **Create these Contact Attributes in Brevo** (Contacts → Settings →
   Contact attributes) before going live — the API rejects attributes it
   doesn't recognize:

   | Attribute (as sent) | Suggested Brevo type | Source field |
   |---|---|---|
   | `NOMBRE` | Text | Nombre |
   | `GENERO` | Text (or Category: `Mujer` / `Hombre`) | Soy |
   | `PROFESION` | Text | Profesión / Cargo (only sent if filled) |
   | `TELEFONO` | Text | Teléfono (only sent if filled; kept as free text rather than Brevo's built-in SMS/phone attribute, which requires strict E.164 formatting) |
   | `SOBRE_TI` | Multiline text (needs to hold up to 600 characters) | Cuéntanos sobre ti (only sent if filled) |
   | `EDAD_35_MAS` | Boolean | Age confirmation checkbox |
   | `CONSENTIMIENTO_COMUNICACIONES` | Boolean | Consent checkbox |
   | `CONSENTIMIENTO_FECHA` | Date/text (ISO datetime) | Recorded automatically, for consent-proof purposes |

   These names are placeholders chosen to be self-explanatory — rename them
   in `src/lib/brevo.ts` to match your Brevo account if you'd rather reuse
   existing attributes.
4. The route uses `updateEnabled: true`, so a repeat submission from the
   same email updates the existing Brevo contact rather than erroring.

## Junto Select Introduction (`/introduction` → `/member`)

First-time onboarding is linear, with a "Continuar" CTA at the bottom of
every step once that step's minimum requirement is met:

```
Sign in → About Me → Lo que buscas → Fotos → Tu presentación → Review → done
```

`src/lib/introduction/completion.ts`'s `getNextOnboardingRoute()` is the
single source of truth for this order — every page redirects a returning
user to whatever's next via that one function, so "resume where you left
off" and "the guided sequence" can never drift apart. Each page also
calls `getPrerequisiteRedirect()` to bounce someone forward if they try to
skip ahead (e.g. opening `/member/profile/photos` directly before Lo que
buscas is done) — but it only ever redirects *forward* when something
earlier is missing, never away from a page whose prerequisites are
already met. That's what lets `/member/profile`'s section list stay a
hub afterward: reopening an already-completed section to edit it is
always allowed, onboarding or not.

Once a profile has everything the guided flow requires, it lands on
`/member/profile`, "Así se verá tu perfil" — a read-only preview of the
profile roughly as another selected member would eventually see it,
built from `ProfileCard.tsx`. Pressing "Guardar y finalizar" there is the
*only* place `meta.onboardingFinalized` is ever set — it's never inferred
just because every section happens to have data. `ProfileCard`
deliberately reads only `profile.visible`, `profile.photos`, and
`profile.presentation.approvedText`; it never reads `profile.private`
(except internally, to derive an age from the birth date — the date
itself is never rendered), never reads `profile.contactPreferences`, and
never reads `profile.dealbreakers` / `profile.preferences` at all, since
those are matching-only. The same component renders both "Así se verá tu
perfil" (pre-finalize) and "Ver mi perfil" (after) — same URL, same
component, the only difference is which actions show beneath it.

A finalized profile stays fully editable — reopening any section from
`/member/profile`'s section list and changing something never clears
`onboardingFinalized`; the person can always come back and see the
updated version.

Sign-in (Google or a passwordless email link) and Step 1 ("About me") are
entirely client-side: the Firebase client SDK talks directly to
Firestore, secured by `firestore.rules`. Photos additionally use Firebase
Storage, secured by `storage.rules`. "Tu presentación" is the one part
with a server component — see below.

### Photo upload feedback

Selecting a photo shows it immediately via a local `URL.createObjectURL`
preview — before compression, before the Storage upload, before the
Firestore write — with a "Guardando foto…" caption while those happen in
the background, then a brief "Foto guardada" before it settles into the
normal thumbnail. Only one upload is allowed in flight at a time (the
empty-slot inputs disable while one is saving) to prevent an accidental
duplicate selection. Every object URL created for a preview is revoked
once it's no longer needed (on success after the brief confirmation, on
error dismissal, and on unmount) to avoid leaking memory. None of this
touches the underlying privacy architecture — photos are still processed
client-side, uploaded to Firebase Storage, and referenced by path (never
a public download URL); see `src/lib/introduction/photos.ts`.

### Fixed: photo stuck on "Cargando…" forever

`PrivatePhotoThumbnail` (the component that loads a saved photo's bytes
via the authenticated Storage SDK and renders them as an object URL) had
no `.catch()` on that fetch. Any failure — a stale Firestore path
pointing at an already-deleted Storage object, an auth/token hiccup, a
transient network error, anything — left the component's `url` state
unset forever, with only a silent unhandled promise rejection and no way
for the UI to ever leave its "Cargando…" state. It now tracks an explicit
`loading | loaded | error` state and always reaches a terminal one,
showing "No se pudo cargar la foto." on failure instead of hanging. Also
hardened `deletePhoto()` (`photos.ts`) to write Firestore *before*
deleting from Storage rather than after — reversed, a Storage-delete
that succeeds followed by a Firestore write that fails leaves exactly the
stale-path situation above; the new order's only failure mode is a
harmless orphaned Storage object nothing ever references again. Neither
change touches the privacy architecture (still no public download URLs).

## Member area

`/member/*` (see "Information architecture") is the authenticated
product shell: `MemberShell` (in `src/components/member/`) checks
sign-in, provides the uid via `MemberContext`, and renders `MemberNav` —
a slim top bar on desktop (a short row of text links, not a persistent
sidebar — a sidebar reads as a SaaS dashboard, which is exactly the tone
this product avoids) collapsing to a hamburger + slide-over drawer on
mobile. Every `/member/**` page other than `/member/profile` itself uses
`useMemberProfile()` to fetch the profile and redirect back into the
flow (via `requireFinalized()` in `completion.ts`) if onboarding isn't
finished yet; `/member/profile` has its own finer-grained prerequisite
check since it's also the finalize step.

**Proposals, Connections, and Plan are intentionally empty-state shells**
— no matching engine, no mutual-interest logic, and no billing exist yet.
Each page's own file comment says what it's structurally ready for later
(e.g. Proposals' eventual Nuevas/Pendientes/Pasadas sections) without
building UI for data that doesn't exist. Settings' "Cancelar suscripción"
(Plan) and "Eliminar perfil" (Settings) are both disabled placeholders —
neither does anything yet, on purpose; see "What a real Plan/deletion
flow would need" below for what's actually missing before either could
be real.

### What a real "Mi plan" would need

Nothing about membership tier or billing exists in the data model today
— Plan's "Perfil pasivo" is a hardcoded placeholder, not a read of real
state. Before this page can show anything real, the profile (or a
sibling document) needs at least: a membership tier field (e.g. `"free"
| "active_select"`), a renewal/expiry date, and whatever Stripe (or
equivalent) sends via webhook to keep that field in sync — none of which
this pass builds.

### Contact preferences

`/member/profile/contact`, "¿Cómo prefieres que te contacten?" — how a
person wants to be reached once a mutual introduction is eventually
built. Stored as `profile.contactPreferences` (`preferredMethod`, an
optional `additionalMethods[]`, and the detail fields the chosen methods
actually need — `phone` shared by WhatsApp and Teléfono, `instagram`,
`linkedin`). No separate contact-email field: choosing "Email" always
means the account's authenticated email (already on the Firebase Auth
user), never a second field that could drift out of sync with it.

This is **strictly private account data** — `ProfileCard` never imports
`contact.ts` or reads this field, so it structurally cannot appear on
"Ver mi perfil," the Review screen, or (once they exist) proposal cards
or another member's profile. It's intended only for a future
contact-reveal step after both people accept an introduction; that reveal
logic doesn't exist yet — this pass only collects, validates, stores, and
lets the person edit it.

Not required anywhere yet — reachable from `/member/profile`'s section
list and linked from Ajustes, but nothing blocks onboarding or
finalization on it being filled in. **Where to require it later:** once a
real introduction flow exists, the natural gate is alongside the other
matching-eligibility checks in `completion.ts` (`isContactPreferencesComplete()`
in `contact.ts` already exists, ready to be wired in there) — not
retrofitted into the existing finalize step now, which would silently
turn an already-shipped, already-tested flow into a longer one without
you asking for that.

### Profile completion & matching eligibility

Each profile document (`profiles/{uid}`) tracks `meta.aboutMeComplete`,
`meta.photosComplete`, `meta.preferencesComplete`, and
`meta.presentationComplete`, plus a derived `meta.profileStatus`
(`"draft"` or `"active_for_matching"`) computed by
`src/lib/introduction/completion.ts`. A profile becomes eligible for
matching once About Me, at least one photo, and "Lo que buscas"'s
dealbreakers section are all complete — **"Tu presentación" is
deliberately not required for eligibility today**; it's tracked and
strongly encouraged in the UI, but a complete-and-filter-ready profile
without a written presentation still counts as eligible. This is a single
list (`SECTIONS_REQUIRED_FOR_MATCHING` in `completion.ts`) — adding
`"presentation"` to it is the entire change needed to make it mandatory
later; nothing else references that list.

Within "Lo que buscas", `dealbreakers` (hard filters the future matching
engine will apply first) must be fully answered for the section to count
as complete; `preferences` (soft compatibility signals) are optional by
design.

Note `meta.profileStatus` (matching eligibility) and
`meta.onboardingFinalized` (has explicitly confirmed the Review screen)
are deliberately separate flags answering different questions — the
guided flow's `getNextOnboardingRoute()` requires an approved
presentation before Review, even though `profileStatus` does not require
one. A profile can therefore be `active_for_matching` without being
`onboardingFinalized` (e.g. someone who reached these three sections via
Profile Home's hub rather than the guided flow) — Profile Home's copy
reflects `onboardingFinalized`, not `profileStatus`, since "finalized" is
the stronger, more deliberate signal.

**Known limitation, now actually live, not just theoretical:**
`meta.profileStatus` is still computed and written by the client, not
enforced by a Firestore rule or a server function — and the V1 matching
engine below now genuinely reads it to decide who's in the candidate
pool. A malicious client could in principle set `meta.profileStatus:
"active_for_matching"` on their own profile without truly completing any
section, and get considered by the engine. This is a real trust boundary
that should move behind either a Firestore rule (validating it against
the other `meta.*complete` flags) or a server-side write before a wider
rollout past dry-run/allowlist testing. Not fixed in this pass — flagging
it now that it has a real consumer, rather than leaving it only as a
"someday" note.

## Monthly matching engine (V1)

`src/lib/matching/` — the deterministic, reciprocal matching engine and
its supporting duplicate-account and account-linking infrastructure.
Everything here is server-only (Admin SDK), triggered manually via
`/api/admin/matching/*` routes (see below) — there is no automatic
scheduler wired up yet, and no UI consumes any of this yet beyond the
still-placeholder "Mis propuestas" page.

**Algorithm** (`hardFilters.ts`, `scoring.ts`, `engine.ts`), strictly in
this order, never reordered or overridden by anything downstream:

1. **Hard requirements**, reciprocal — a pair is only considered if
   *both* people's `dealbreakers` accept the other (gender, age range,
   relationship intention, smoking, children). Two of the product's
   existing dealbreaker questions (`partnerHasYoungChildrenOk`,
   `partnerWantsFutureChildren`) ask about information the *other*
   person's profile doesn't actually collect (there's no "are your
   children under 15" or "do you want children in the future" field on
   `AboutMeVisible`) — they are **not enforced**, since enforcing them
   would mean guessing at data nobody provided. Closing this needs a
   schema addition, not a matching-engine change. Distance is
   best-effort too: `"misma_ciudad"` is an exact normalized-city string
   match (no geocoding exists); `"hasta_50km"`/`"sin_limite"` both pass
   regardless of city today.
2. **Structured, versioned scoring** (`scoring.ts`) — a deterministic
   0–100 weighted sum over height/drinking/activity fit, same-city bonus,
   language overlap, and education alignment. No opaque AI
   decision-maker. `SCORING_VERSION` is stamped on every proposal so
   weights can be recalibrated later from real Interested/Pass/mutual
   outcomes without losing track of which version produced a historical
   proposal.
3. **Minimum-quality threshold** (`CycleConfig.qualityThreshold`,
   default 55/100) — a candidate must clear this to be proposed at all.
4. **Maximum 3 final proposals** (`MAX_PROPOSALS_PER_MEMBER` in
   `config.ts`, a plain constant, not part of the mutable config, so
   nothing can accidentally raise it) — quality over quota; 0, 1, 2, or 3
   are all valid outcomes and the threshold is never relaxed to reach 3.

**Proposal ≠ introduction — the three-stage lifecycle**
(`pairHistory.ts`, `analytics.ts`): the algorithm only ever selects a
candidate *for* an active/paid (`searchStatus: "active_search"`) member.
That's stage 1, a `proposals/{cycleId}_{recipientPersonId}_{candidatePersonId}`
document (`stage`: `proposed → viewed → member_interested |
member_passed → mutual_interested`). Only once the member says
**Interested** does stage 2 begin: a free `invitations/{sameId}` document
invites the *original candidate* — who may be a passive/free member — to
review the member's profile and answer for themselves, at no cost
(`invited → viewed → candidate_interested | candidate_passed →
mutual_interested`). Only when **both** sides have said Interested does
stage 3 exist: an `introductions/{sameId}` document (`contactRevealedAt`
is a field on it already, reserved for a contact-reveal flow that isn't
built). A member's Pass and a candidate's Pass are treated identically —
either one moves the pair into `pairHistory`'s 6-month cooldown.
Funnel counts (`analytics.ts`: selections, viewed, member
Interested/Pass, invitations sent, candidate viewed/Interested/Pass,
mutual introductions) are kept as separate queryable numbers on purpose —
"3 selections" is never the same claim as "3 introductions delivered",
and a future Admin Dashboard needs these separated to diagnose why a
paying member has zero introductions (0 selections → pool/criteria
issue; selections with 0 member-Interested → the selections didn't
appeal; member-Interested with 0 candidate-Interested → candidates
declined). No dashboard UI exists yet — only the numbers to build one on.

**Member/candidate actions** (`Me interesa` / `Pasar`) are implemented as
server-side, transactional, idempotent functions
(`recordMemberDecision`, `recordCandidateDecision`) — deciding the same
way twice is a no-op, deciding a conflicting way after an existing
decision is rejected, not silently overwritten. They're currently
callable only via the admin-secret-protected `/api/admin/matching/
proposal-decision` and `/invitation-decision` routes, **not** from a
member-facing, ID-token-authenticated endpoint — that's the one piece of
this request deliberately left for the next pass (see "What's NOT built"
below), since building the actual reciprocal-invitation UI would have
substantially expanded this change.

**Passive vs. active_search** (`meta.searchStatus`): `passive` (the
default for everyone) can still be selected as a candidate for someone
else's cycle, but never receives their own proposals. `active_search`
receives up to 3 proposals per monthly cycle. There is no Stripe
integration, so nothing is ever inferred into `active_search` from
profile completeness or payment — it's flipped only by an explicit
allowlist/admin action today, and by a future billing webhook once
Stripe exists.

**Duplicate-person / account-integrity infrastructure**
(`identity.ts`, `duplicates.ts`): the engine groups the eligible pool by
`meta.personId` (defaults to a profile's own uid) rather than raw uid, so
a merged/duplicate pair of accounts can never occupy two pool slots.
`detectDuplicateCandidates()` scans all profiles, normalizes
phone/email/Instagram/LinkedIn (Gmail dot/plus normalization included),
and hashes each *processed* photo (SHA-256 of the already-re-encoded
bytes, so a re-upload under a different filename is still caught) —
matches are written as scored `duplicateCandidates/{uidLow}_{uidHigh}`
entries for human review, never auto-promoted to a confirmed duplicate.
**No facial recognition or perceptual image hashing** — exact-hash only
for V1, per explicit product decision; perceptual (near-duplicate, e.g.
re-cropped) hashing is postponed, and biometric/facial matching is not
planned without a dedicated legal/ethics discussion first.
`meta.duplicateStatus` (`clear | suspected | confirmed_duplicate |
resolved`): `suspected` excludes a profile **both** as a recipient and as
a candidate for others (never just one side) until a human resolves it —
the priority is never letting the same probable real person occupy two
matching-pool slots. `confirmed_duplicate` is the same, permanently,
until (if ever) resolved; it's set only by `mergePeople()` (via
`/api/admin/matching/merge-people`), never automatically. `mergePeople`
also writes `people/{personId}` and repoints the secondary profile's
`meta.personId` — the actual mechanism behind Firebase Auth
provider-linking-based account recovery described in the duplicate-
accounts design discussion; there's still no self-service UI for any of
this.

**Safety, idempotency, and rollout staging** (`engine.ts`,
`config.ts`): every cycle is a `matchingCycles/{cycleId}` document with a
per-member `memberRuns/{personId}` subcollection used as a claim/resume
mechanism — a `claimed` run older than 30 minutes is treated as crashed
and reclaimed. Every proposal write happens inside one Firestore
transaction, keyed by a deterministic id
(`{cycleId}_{recipientPersonId}_{candidatePersonId}`) and gated by the
memberRun's `proposalCount` counter, so a retry, a duplicate trigger, or
two concurrent invocations of the same cycle can never produce a 4th
proposal or a duplicate one — they become no-ops. `pairHistory` (a
canonical sorted-pair document) blocks re-proposing a pair that's
`pending`/`invited` (mid-flow), `mutual` (already introduced), in an
active Pass cooldown, or permanently `blocked` (a human/safety action via
`blockPair()` — not yet wired to an API route). Rollout modes
(`CycleMode`): `dry_run` (computes and records bookkeeping, writes
**nothing** to `proposals`/`pairHistory`/`invitations`), `allowlist`
(real writes, only for `config.allowlistPersonIds`), `limited_live` (real
writes, capped by `maxMembersPerRun`, no allowlist), `production` (the
full `active_search` pool). **Nothing schedules `production`
automatically** — there is no Cloud Scheduler job, cron, or App Hosting
equivalent wired up. Activating real monthly automation later means
creating a Cloud Scheduler job that calls `/api/admin/matching/run-cycle`
with `mode: "production"` on a monthly cadence — a Console/`gcloud`
action outside this codebase, deliberately not done.

**What's NOT built** (by explicit scope, not oversight): the
member-facing "Mis propuestas" UI for actually seeing a proposal/
invitation and clicking Interested/Pasar (the actions exist server-side
and are tested directly — see below); mutual-introduction contact reveal;
an admin dashboard for the funnel analytics or duplicate-candidate
review queue; a Firestore-rule-enforced `meta.profileStatus` (see the
limitation noted above); a member-facing (Firebase-ID-token-
authenticated) version of the decision routes — today's routes are
admin-secret-protected only, mirroring `MATCHING_ADMIN_SECRET` below.

**Manual setup required before this can run anywhere but the emulator:**
add a `MATCHING_ADMIN_SECRET` secret in Secret Manager and grant the App
Hosting backend's service account access to it, exactly like
`ANTHROPIC_API_KEY` above:

```bash
echo -n "a-long-random-value" | gcloud secrets create MATCHING_ADMIN_SECRET --data-file=- --project=select-dev-508407
gcloud secrets add-iam-policy-binding MATCHING_ADMIN_SECRET \
  --member="serviceAccount:firebase-app-hosting-compute@select-dev-508407.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=select-dev-508407
```

And deploy the updated `firestore.rules` (new `proposals`/`invitations`/
`introductions` read rules — see "Deploying Firestore and Storage rules"
below); everything else under `matchingCycles`, `memberRuns`,
`pairHistory`, `people`, `duplicateCandidates` is covered by the existing
default-deny wildcard rule, since it's Admin-SDK-only with no legitimate
client path.

### AI presentation generation

"Tu presentación" asks 2–4 short prompts, then calls
`POST /api/introduction/generate-presentation` to turn them into an
elegant draft the person reviews, edits, and explicitly approves before
it counts as complete. This is the one server-side piece in the whole
feature, for two reasons that both require a trusted server:

- The Anthropic API key must never reach the browser.
- **The facts the AI is allowed to use must not be client-suppliable.**
  The route takes no facts in its request body at all — it verifies the
  caller's Firebase ID token, then re-reads that uid's own profile
  straight from Firestore with the Admin SDK, and builds the prompt only
  from what's already saved there. A client can't inject a fabricated
  fact into its own generation this way; the system prompt (see
  `src/lib/ai/generatePresentation.ts`) additionally instructs the model
  never to add anything not given. Approval always requires a person to
  read the text — this isn't a substitute for that, but a second layer.

Requires `ANTHROPIC_API_KEY` (server-only — see `.env.example` and
"Environment variables" below) and, on Firebase App Hosting, the Admin
SDK's Application Default Credentials, which App Hosting provides
automatically via the backend's attached service account — no extra
setup needed there. Locally, this route isn't exercised unless you also
run the Auth/Firestore emulators (see below) with a real
`ANTHROPIC_API_KEY` set, or you set `GOOGLE_APPLICATION_CREDENTIALS` to a
service account key with Firestore/Auth admin access.

**Manual setup required for this to work in production** — the API key
is a real secret, so it's referenced in `apphosting.yaml` as a Secret
Manager `secret`, not a plaintext `value` like the Firebase config above.
Before the next rollout:

```bash
# Create the secret (one time) with your real Anthropic API key:
firebase apphosting:secrets:set ANTHROPIC_API_KEY --project select-dev-508407

# Grant the App Hosting backend's service account access to read it:
firebase apphosting:secrets:grantaccess ANTHROPIC_API_KEY --project select-dev-508407 --backend <backend-id>
```

(`<backend-id>` is the App Hosting backend's name, visible in Firebase
Console → App Hosting.) Without this, the generation route will fail at
request time with an authentication error from the Anthropic SDK — Step
1, Profile Home, Fotos, and Lo que buscas are entirely unaffected, since
none of them call this route.

The email-link flow ("Continuar con email") sends a sign-in link via
Firebase Auth to whatever address the person enters, always pointing back
at `/introduction` on the current origin. Opening it on the same
device/browser completes sign-in automatically; opening it elsewhere (a
different device, or an email app with its own in-app browser) asks the
person to confirm their email once before completing.

### Environment variables

Add these (see `.env.example`) — all public/non-secret Firebase web config:

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Get these values from Firebase Console → Project settings → General → Your
apps → Web app (create one if it doesn't exist yet).

**On Firebase App Hosting specifically**, setting these in the Console's
"Environment variables" panel is not enough by itself: Next.js inlines
`NEXT_PUBLIC_*` values into the client bundle at `next build` time, not at
runtime, and App Hosting's Cloud Build step only sees values declared in
the committed `apphosting.yaml` (or entered through a flow that writes to
it). This repo's `apphosting.yaml` declares all six variables — replace
its `"SET_ME"` placeholders with the real values before the next rollout,
then trigger a new build (an existing build's bundle won't pick up a
later-edited apphosting.yaml retroactively). It also pins
`NEXT_PUBLIC_USE_FIREBASE_EMULATOR` to `"false"` so it can't accidentally
end up `"true"` in production.

### Running against the Firebase Emulator Suite locally

```bash
npx firebase-tools emulators:start --only auth,firestore,storage
```

In a separate terminal, with a `.env.local` containing
`NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` (plus any placeholder values for
the other `NEXT_PUBLIC_FIREBASE_*` vars — the emulator doesn't need real
ones):

```bash
npm run dev
```

To also exercise the presentation-generation route locally against the
emulators (rather than real Firebase), additionally set
`FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` and
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` — the Admin SDK picks these up
automatically — plus a real `ANTHROPIC_API_KEY` (the AI call itself isn't
emulated).

### Deploying Firestore and Storage rules

```bash
firebase deploy --only firestore:rules,storage:rules
```

or paste the contents of `firestore.rules` / `storage.rules` directly
into Firebase Console → Firestore Database → Rules / Storage → Rules.

## Privacy notes

- Submitted form data is only ever sent to Brevo; nothing is logged,
  stored in this repo, or sent to analytics.
- Server logs on failure record only an HTTP status/error class, never the
  submitted name/email/etc.
- `/introduction` profile data is private by default: Firestore rules
  allow a signed-in user to read/write only their own `users/{uid}` and
  `profiles/{uid}` documents — everything else is default-denied. Photos,
  dealbreakers/preferences, and presentation prompts/text all live as
  fields on that same `profiles/{uid}` document, so they inherit this
  same owner-only rule automatically — no rules change was needed to add
  them.
- Photos are stored in Firebase Storage under `profiles/{uid}/photos/`,
  owner-only per `storage.rules`. The app never calls `getDownloadURL()`
  for them — that returns a token-bearing URL that bypasses Storage rules
  for anyone who ever obtains it, which is wrong for private photos.
  Instead it fetches bytes through the authenticated SDK (`getBytes`),
  which is rule-checked, and displays them via a local object URL.
- Uploaded photos are re-encoded through a canvas before upload (see
  `imageProcessing.ts`), which strips all EXIF metadata, including GPS
  location, since canvas pixel data carries none of it.
- Contact preferences (`profile.contactPreferences`) are private for the
  same structural reason as everything else here: they're a field on the
  same owner-only `profiles/{uid}` document, and `ProfileCard` — the only
  component that renders a profile to "another member" — never reads
  them.
- `/privacidad` and `/terminos` are placeholder pages only (no real legal
  text yet, on purpose — writing actual privacy/terms copy isn't
  something to fabricate) — replace their content with real legal review
  before relying on them for anything.
