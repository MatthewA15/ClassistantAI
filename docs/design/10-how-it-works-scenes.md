# 10. How-it-works scenes

Source: [`components/landing/hiwScenes.tsx`](../../src/frontend/components/landing/hiwScenes.tsx),
keyframes in [`app/globals.css`](../../src/frontend/app/globals.css)

Four looping stick-figure animations, one per step, replacing the icon-in-a-
rounded-square that sat there before. An icon labels a step; these show it
happening, which is the point of
[the visuals-over-copy principle](02-design-system.md).

## Drawing language

One system, so the row reads as a set:

- 4.2 stroke, round caps and joins, thick enough to survive at card size.
- `--color-ink-800` for structure, brand blue for the thing being acted on.
- `--color-alert` and `--color-ok` appear **only** where the story needs a fail
  or a pass. They are the two functional colours and nothing else uses them.
- All four share one **9s cycle**, so the row breathes together rather than
  four loops drifting against each other.
- Each scene has its own `viewBox` crop. That enlarges a figure without
  re-plotting every coordinate.

## The four

**1. Sign in.** Types, screen goes red, scratches his head, types again, screen
goes green, both arms up. Four arm poses swap by opacity over a fixed body.

**2. It reads everything.** A cursor moves down a screen, a highlight sweeps a
line, a copy chip pops. Three passes, each element carrying a one-third delay
off the same keyframes.

**3. Calendar fills itself.** Dates get claimed: struck out and red, or ticked
and green, staggered so the grid fills over the cycle.

**4. It stays on you.** A hand holds a phone while the thread fills in.

## Three bugs worth remembering

**Gaps between animation windows are visible.** The four poses in step 1
originally had a few percent of breathing room between their visibility
windows. In each gap *every* pose was hidden, so the figure lost both arms for
a moment. Pose windows now hand over at the same percentage
(`29.9%` → `30%`). Verified by sampling all nine seconds and asserting exactly
one pose is visible at each.

**`fill` after the spread, not before.** The shared `stroke` object carries
`fill: "none"`. Writing `fill="#fff" {...stroke}` silently overwrites it and
gives you see-through shapes. TypeScript catches this one (`TS2783`), so do not
suppress it.

**A hand needs width to read as a hand.** Two attempts failed: matching curls on
both edges of the phone read as brackets, and four straight lines off a spine
read as a rake. Fingers only work as *filled capsules with rounded tips* laid
across the edge, drawn after the screen content so they clearly sit in front,
with an asymmetric grip (fingers far side, thumb near side, wrist from a
corner).

## Accessibility

Every scene is `aria-hidden` with `role="presentation"`. The step title and body
carry the meaning, so nothing is lost when animation is off, and the global
reduced-motion block freezes all of them.
