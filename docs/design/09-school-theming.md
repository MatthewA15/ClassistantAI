# 09. School theming

Source: [`components/theme/SchoolTheme.tsx`](../../src/frontend/components/theme/SchoolTheme.tsx),
[`components/landing/HeroStart.tsx`](../../src/frontend/components/landing/HeroStart.tsx)

## What it does

The hero lists all six supported schools as buttons. Picking one repaints the
entire site in that school's own brand colours and unlocks the CTA.

Picking a school **is** step one of getting started, so it happens in the hero
rather than on a separate screen. The repaint does two jobs at once: it confirms
we recognised the school, and it shows the product is built for that specific
campus rather than being a generic tool with a maple leaf on it.

## One colour in, a whole theme out

Every token is derived from the school's **single published primary colour**
using `color-mix`, rather than hand-picking a ramp per school:

```
--color-brand-600: <primary>
--color-sky-100:   color-mix(in oklab, <primary> 8%, white)
--color-ink-900:   color-mix(in oklab, <primary> 38%, black)
```

That matters for maintenance. Contrast relationships are identical across all
six themes, so adding a seventh school is one hex code and no legibility review.
Hand-tuned per-school ramps would need re-checking every time.

Vars are set on `document.documentElement` in an effect, so there is no
server/client mismatch: the first paint is always the default blue.

## The colours are researched, not invented

Students recognise their own school's colours instantly, so a guessed hex reads
as fake immediately. Every value comes from the school's published brand
guidelines with a `source` recorded next to it in `data/schools.ts`:

| School | Primary | Accent |
| --- | --- | --- |
| Toronto Metropolitan | `#004C9B` | derived |
| York | `#E31837` | derived |
| Lakehead | `#004271` | `#FFC20E` |
| Memorial | `#862633` | derived |
| University of Alberta | `#007C41` | `#FFDB05` |
| Mount Royal | `#003352` | `#007FB5` |

`accent` is only set where the school publishes a real second colour. Everywhere
else the theme derives a tint, rather than inventing a colour and attributing it
to an institution.

## Logos: deliberately not shipped

The school buttons show a **brand-coloured monogram**, not the school's logo.

University logos are trademarks. Reproducing them on a third-party commercial
product implies endorsement, which is exactly what our own footer and terms
disclaim, and most institutions' brand guidelines forbid third-party use without
written permission. A redrawn approximation is worse: still a trademark problem,
and obviously fake to any student who knows the real mark.

Using the school's **name** in plain text to state compatibility is a different
matter and is normal nominative use. That is why the buttons carry the full legal
name.

`School.logo` exists in the data model. Once a school grants written permission,
drop the asset path in and the crest swaps to an `<img>` with no layout change.

## Full names, never abbreviations

The buttons say "University of Alberta", not "U of A". Abbreviations are
unambiguous on campus and meaningless off it, and this is the exact moment a
student confirms we mean their school.

## The locked CTA

The CTA is a **message composer**, not a button, because the product is a thread.

The right-hand control is two different affordances, the way iMessage's is, not
one control that dims. With nothing to send it is the bare voice-memo waveform in
grey, no button behind it. With something to send it becomes a filled circle
holding the send arrow. Both sit in the same 8x8 box so the swap does not shift
the text beside them.

The copy follows the same split. Locked, the bar holds instruction text,
"Pick a school above, then click here": it is addressing the reader, so it is
sentence case. Once a school is chosen the bar holds the message the reader is
about to send, "i'm ready to start for free", lowercase because that is how a
person types a text.

The send circle fills with `--color-brand-600`, so it repaints into the school's
own colour along with the rest of the page.

It is `aria-disabled`, not `disabled`, because a truly disabled control swallows
the click and gives no feedback at all. Pressing it while locked instead:

- grows "Pick your school" to 150% and extra-bold for three seconds,
- outlines the six school buttons in `--color-alert`,
- announces "Pick your school before continuing" to screen readers.

`--color-alert` (`#e5484d`) is the only non-blue in the system. It is functional
only, never decorative, and school themes deliberately do **not** override it: an
error must not repaint itself into a school's brand colour.

### One gotcha worth remembering

The nudge label originally set `font-semibold` in the base class list and
`font-extrabold` in the active branch. Both are single-class selectors, so
Tailwind's own emission order decided the winner, and semibold silently won. Put
competing utilities in the branches only, never one in the base and one in the
branch.
