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
  components/               one component per section, plus shared bits
    Hero.tsx, WhoYouMeet.tsx, PrivateSection.tsx, InvitationSection.tsx,
    Footer.tsx, Wordmark.tsx, Section.tsx
    InvitationForm.tsx      the native application form (client component)
    introduction/            Step 1 UI: AuthButtons, ConfirmEmailForLink,
                             OnboardingWizard, StepQuestion, IneligibleAge,
                             OnboardingComplete
  lib/
    brevo.ts                server-only Brevo API call
    types.ts, validation.ts shared between the form and the API route
    styles.ts               a couple of shared Tailwind class strings
    firebase/                client.ts (SDK init), auth.ts, useAuth.ts
    introduction/            aboutMeFields.ts (field config), types.ts,
                             profile.ts (Firestore access), age.ts
ASSETS.md                   what photography/logo is still needed, and where
firestore.rules             Firestore Security Rules (owner-only + age gate)
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

## Junto Select Introduction (`/introduction`) — Step 1

Step 1 is account creation (Google sign-in or a passwordless email link) +
the "About me" section of the profile, entirely client-side: the Firebase
client SDK talks directly to Firestore, secured by `firestore.rules`. No
server route, no Admin SDK, and no session cookie exist yet for this
feature — that's deliberate for this stage, not an oversight; see the
implementation report for why.

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
npx firebase-tools emulators:start --only auth,firestore
```

In a separate terminal, with a `.env.local` containing
`NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` (plus any placeholder values for
the other `NEXT_PUBLIC_FIREBASE_*` vars — the emulator doesn't need real
ones):

```bash
npm run dev
```

### Deploying Firestore rules

```bash
firebase deploy --only firestore:rules
```

or paste the contents of `firestore.rules` directly into Firebase Console
→ Firestore Database → Rules.

## Privacy notes

- Submitted form data is only ever sent to Brevo; nothing is logged,
  stored in this repo, or sent to analytics.
- Server logs on failure record only an HTTP status/error class, never the
  submitted name/email/etc.
- `/introduction` profile data is private by default: Firestore rules
  allow a signed-in user to read/write only their own `users/{uid}` and
  `profiles/{uid}` documents — everything else is default-denied.
