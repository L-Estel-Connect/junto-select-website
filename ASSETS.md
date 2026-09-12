# Asset manifest — photography & logo

## Photography — done

The three photography slots now use real photography, committed to
`public/images/`:

| Slot | Component | File | Alt text |
|---|---|---|---|
| Hero | `src/components/Hero.tsx` | `public/images/hero.png` | "Grupo elegante conversando en una azotea de Madrid al atardecer" |
| Who You'll Meet | `src/components/WhoYouMeet.tsx` | `public/images/who-you-meet.png` | "Cóctel íntimo y sofisticado en un salón de Madrid" |
| Private. Curated. Personal. | `src/components/PrivateSection.tsx` | `public/images/private-curated.png` | "Momento íntimo en una cena privada en Madrid por la noche" |

All three arrived at 1122×1402 (a native 4:5 ratio, matching each slot's
crop exactly), rendered via `next/image` with `fill` + `object-cover` and a
`sizes` attribute for responsive loading. The old abstract placeholder
component (`src/components/Photo.tsx`) has been deleted.

## Still outstanding

- **Logo mark.** The wordmark is still styled Inter text
  (`src/components/Wordmark.tsx`) and the favicon is still a generated "J"
  monogram (`src/app/icon.tsx`) rather than the real logo asset. Add the
  real file at `public/logo/mark.svg` (or `.png`) when available.
