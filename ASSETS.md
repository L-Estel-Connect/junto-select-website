# Asset manifest — photography & logo

## Current status

Three photography slots exist on the page, each embedded directly inside a
split two-column section rather than as a full-bleed banner:

| Slot | Component | Placement | Suggested content (per the redesign brief) |
|---|---|---|---|
| Hero | `src/components/Hero.tsx` | Right column, ~45% width, 4:5 portrait | Elegant rooftop gathering in Madrid at blue hour, 5–7 guests |
| Who You'll Meet | `src/components/WhoYouMeet.tsx` | Left column, ~45% width, 4:5 | Intimate cocktail/dinner gathering inside an elegant Madrid venue, 4–6 guests |
| Private. Curated. Personal. | `src/components/PrivateSection.tsx` | Right column, ~50% width, ~4:5 | Intimate dinner/cocktail moment at night, ~4 guests |

Each slot currently renders `src/components/Photo.tsx` — an abstract warm
gradient panel with soft blurred highlights in the brand palette. It's a
deliberate design stand-in (no visible "placeholder" text, no dotted
pattern), not a real or fake photo of people. **No photography or logo file
exists in this repository yet.**

## Why

Two different sourcing attempts were made for this project's photography:

1. **Photos attached in chat.** This environment has no accessible file or
   URL for chat attachments — only the rendered images in the conversation,
   which no tool here can read pixel data from.
2. **AI-generated photography**, requested with a very specific creative
   brief (rooftop blue-hour gathering, intimate cocktail scene, private
   dinner scene — see the original request for full detail on cast, wardrobe,
   lighting, mood, and what to avoid). **This session has no image-generation
   tool available** — there is no text-to-image capability wired into this
   Claude Code environment, so these three photographs could not be produced
   here regardless of the detailed brief.

## What to do

Pick whichever is easiest for you:

- **Generate the images yourself** (Midjourney, DALL·E, Stable Diffusion, or
  similar) using the creative brief already written out for each scene, then
  send me the resulting files or direct URLs. If you give me URLs I can
  `curl` them straight into the repo at the paths below — no need to
  re-explain the brief, it's preserved above and in the original request.
- **Add files directly to the repo** at:
  - `public/images/hero.jpg`
  - `public/images/who-you-meet.jpg`
  - `public/images/private-curated.jpg`
  - `public/logo/mark.svg` (or `.png`) for the actual logo mark, currently
    stood in for by styled Inter text (`src/components/Wordmark.tsx`) and a
    generated "J" monogram favicon (`src/app/icon.tsx`).

Once files exist, swap each `<Photo ratio=... label=... />` usage for
`next/image` pointed at the real file, using the `label` text as a Spanish
`alt`. `.webp` is preferred for file weight; any of `.jpg`/`.webp`/`.avif`
works.

## Do not

- Do not use generic stock photography as a substitute.
- Do not alter the people in any supplied photograph.
