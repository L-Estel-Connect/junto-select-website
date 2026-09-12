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
      onboarding/page.tsx    protected "About me" onboarding wizard
      home/page.tsx          Profile Home — status of every section, next step
      photos/page.tsx        protected "Fotos" section
      preferences/page.tsx   protected "Lo que buscas" section
      presentation/page.tsx  protected "Tu presentación" section
    api/introduction/
      generate-presentation/route.ts  server route, calls the Anthropic API
  components/               one component per section, plus shared bits
    Hero.tsx, WhoYouMeet.tsx, PrivateSection.tsx, InvitationSection.tsx,
    Footer.tsx, Wordmark.tsx, Section.tsx
    InvitationForm.tsx      the native application form (client component)
    introduction/            AuthButtons, ConfirmEmailForLink, IneligibleAge,
                             RequireIntroductionAuth (shared auth guard),
                             OnboardingWizard, StepQuestion (Step 1),
                             ProfileHome, PhotosSection, PrivatePhotoThumbnail,
                             PreferencesSection, PreferenceFields,
                             PresentationSection
  lib/
    brevo.ts                server-only Brevo API call
    types.ts, validation.ts shared between the form and the API route
    styles.ts               a couple of shared Tailwind class strings
    firebase/                client.ts (SDK init), admin.ts (server-only,
                             Admin SDK), auth.ts, useAuth.ts
    ai/generatePresentation.ts  server-only Anthropic API call + prompt
    introduction/            aboutMeFields.ts (Step 1 field config), types.ts,
                             profile.ts (Firestore access), age.ts,
                             completion.ts (section/eligibility logic),
                             photos.ts, imageProcessing.ts, preferences.ts,
                             presentation.ts
ASSETS.md                   what photography/logo is still needed, and where
firestore.rules             Firestore Security Rules (owner-only + age gate)
storage.rules                Storage Security Rules (owner-only photo access)
firebase.json, .firebaserc  Firebase project/emulator config
```

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

## Junto Select Introduction (`/introduction`)

The product flow is: sign in → "About me" (Step 1) → **Profile Home** →
Fotos / Lo que buscas / Tu presentación, each independently completable
and revisitable. Profile Home (`/introduction/home`) is the account's
central place — it shows what's done, what's left, and the one obvious
next action; it is deliberately not a dashboard (no percentages, no
gamification, no navigation menu).

Sign-in (Google or a passwordless email link) and Step 1 ("About me") are
entirely client-side: the Firebase client SDK talks directly to
Firestore, secured by `firestore.rules`. Photos additionally use Firebase
Storage, secured by `storage.rules`. "Tu presentación" is the one part
with a server component — see below.

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

**Known limitation, deliberately deferred:** `meta.profileStatus` is
currently computed and written by the client, not enforced by a
Firestore rule or a server function. Today that's inert — nothing reads
it yet, since no matching engine or admin tool exists — but the moment
one does, a client-writable eligibility flag becomes a real trust
boundary and should move behind either a Firestore rule (validating it
against the other `meta.*complete` flags) or a server-side write. Flagged
here so it isn't forgotten, not fixed now, since fixing it now has no
present security benefit and would add complexity ahead of need.

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
