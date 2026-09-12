# Asset manifest — photography & logo

This environment (Claude Code on the web) could not retrieve the photographs
or the logo you attached to the chat as files on disk — there is no
accessible path or URL for chat attachments here, only the rendered images in
the conversation, which no tool can read pixel data from. So none of the
supplied photography or the logo mark is in this repository yet.

To keep everything else moving, every photography slot renders as a clearly
labelled placeholder (`src/components/Photo.tsx` — a soft gradient block with
a caption, not an AI-generated or stock image) instead of a real `<img>`. The
wordmark is set in styled Inter text rather than the actual logo mark.

## What to do

Add the real files at the paths below (any of `.jpg`/`.webp`/`.avif` is fine,
`.webp` preferred for weight), then swap each `Photo` usage for a `next/image`
pointed at that path. Suggested crops/placements, chosen for composition and
page rhythm from what was shown in chat:

Mirroring the current Carrd site, the hero itself is a centered text column
with no side photo — photography gets its own full-bleed, breathing-room
sections instead (per the requested 7-part structure). That leaves two
photography slots on this page:

| Slot | File to add | Source photo (from chat) | Notes |
|---|---|---|---|
| Photo break #1 (right after the hero) | `public/images/photo-break-1.jpg` | Rooftop sunset scene, woman with a champagne glass in the foreground, blurred guests behind | Full-bleed wide crop (~21:9 desktop, ~4:5 mobile) |
| Photo break #2 (before "Private. Curated. Personal.") | `public/images/photo-break-2.jpg` | Moody candlelit interior — woman in a dark dress seen from behind, lit candle and glass on a side table | Full-bleed wide crop; already vertical/moody, a center crop works well — its quieter, intimate mood pairs well with that section |
| Logo mark | `public/logo/mark.svg` (or `.png`) | The dusty-rose interlocking abstract mark | Used for favicon + optionally beside the wordmark |
| Favicon | `public/favicon.ico` | Derived from the logo mark | Regenerate from the mark once supplied (e.g. via a favicon generator) |
| Open Graph image | already built at `src/app/opengraph-image.tsx` | — | Typographic only (no photo), so it works today; can be swapped for a photo-based one later if you prefer |

**Not used on this page:** the close-up of two champagne flutes clinking
(hands only, blurred rooftop crowd and sunset bokeh behind). The brief asks
this page to stay concise with exactly two photography breaks, so a third
full-bleed photo section wasn't added. That image is a strong candidate for
the future `/introductions` page, or as a photo-based Open Graph image later.

None of the "screenshot of the Carrd editor" images were used as a source —
per your instructions they were visual inspiration only, and they also
contain editor chrome (toolbars, selection outlines) rather than a clean
photo.

## Do not

- Do not replace these with AI-generated images or generic stock photography.
- Do not alter the people in the supplied photographs.
