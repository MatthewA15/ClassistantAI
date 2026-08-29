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

## The default-blue flash on a hard load, and why the theme is now server-rendered

Picking U of A themes the site green. Refreshing on the number screen showed the
whole page in the default blue for a moment, then it faded to green.

The provider is the reason. It applies its tokens by writing inline custom
properties onto `<html>` from a `useEffect`, and an effect cannot run until React
has hydrated. Its state also starts at `null`, and it lives in the root layout,
which has no way to read `?school=`. So the sequence on a hard load of
`/onboarding?school=ualberta` was:

1. server sends HTML with no theme tokens, so the browser paints the default blue
2. React hydrates
3. the wizard's effect calls `setSchool("ualberta")`
4. the provider's effect writes the green tokens

Between 1 and 4 the page is blue, and step 4 arrives inside the 620ms
`theme-shift` window, so it did not even swap cleanly — it *faded*, which is what
made a one-frame problem impossible to miss.

**The fix is to send the tokens as a stylesheet.** `themeCss` in
`components/theme/themeVars.ts` renders the same token set as CSS text, and
`OnboardingFrame` emits it as a `<style>` when the page knows the school. The
first paint is then already green and the provider's effect changes nothing when
it arrives.

Three details that make it hold:

**`themeVars` moved out of `SchoolTheme.tsx` into its own module.** A server
component cannot call a function it imports from a `"use client"` file — it gets
a client reference, not the function. The shared module is what lets the server
stylesheet and the client provider derive from one implementation instead of two
that drift.

**The selector is `:root:root`, not `:root`.** Tailwind's default palette is a
plain `:root` block in the linked stylesheet. Equal specificity would leave the
winner up to document order, which happens to work today and would break
silently the day React decided to hoist this `<style>` into the head. Doubling
the selector wins on specificity instead, which is not order-dependent. It still
loses to the provider's *inline* properties, which is correct: those are what a
student switching schools without a reload updates.

**The OAuth callback carries `?school=` now.** It always knew the school and was
dropping it, so the return leg from Google landed unthemed. The other source for
it is the user document, and reading that costs the two network calls
[16](16-onboarding-entry-cost.md) deliberately keeps below the Suspense boundary.

`theme-shift` is also no longer added on the provider's first effect run. Nothing
is switching at mount, and opening a 620ms window where every element on the page
transitions its colours is exactly how the old flash became a fade.

`loading.tsx` renders the frame with no school and therefore no `<style>`, which
is fine and not worth fixing: it is only ever shown during a client-side
navigation, and by then the provider has already themed the document.

Values reaching that stylesheet come from `data/schools.ts`, which is ours and
committed — an unknown `?school=` fails `getSchool` and yields no style at all.
Keep it that way: a school colour that ever came from a URL or a form would need
escaping before it reached a `<style>`.
