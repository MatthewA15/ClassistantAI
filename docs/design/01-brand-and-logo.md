# 01. Brand and logo

## The problem the mark has to solve

Classistant is two things at once: it is about school, and it is about someone
handling that for you. A logo that only says "school" looks like every other
edtech product. A logo that only says "assistant" or "chat" looks like a support
widget. The mark had to fuse both and stay legible at 24px in a browser tab.

## What we built

**An OK hand holding up half a graduation cap.**

- The **hand** is the promise: handled, sorted, you are good.
- The **cap** is the subject.
- The cap is drawn whole, but its left point sits behind the fingers, so what
  reads is the right half of a mortarboard emerging from a fist.
- The hand **faces right**: the thumb-and-index ring is on the cap side, the
  three fingers behind it. Facing left the ring lands at the far edge of the
  mark, away from the cap, and the pinch stops reading as a pinch.

Source: [`components/brand/LogoMark.tsx`](../../src/frontend/components/brand/LogoMark.tsx)

The favicon at [`app/icon.svg`](../../src/frontend/app/icon.svg) is the same
geometry on a dark rounded square, hand-copied rather than imported. Change one
and the other does not follow, which has already bitten once: the favicon's copy
of the hand was **mirrored**, ring on the left and away from the cap, which is
the orientation the rules below rule out. If you edit the mark, diff the two.

## The app icon

`LogoPlate` is the mark on a plate, for anywhere it stands in for the product
rather than labelling a page: a contact photo, a caller, a notification sender.
Same recipe as the favicon.

The plate is a parameter and picks the tone with it, because the two are not
independent. The `white` tone's crown is brand blue and vanishes on a blue
plate; the `brand` tone's hand is near-navy and vanishes on a dark one. Both
mistakes ship a mark with a hole in it. Dark plate for light surroundings, white
plate for a dark screen.

It scales the mark to 0.76 of the plate rather than filling it. The tassel
reaches the right edge of the artwork, so at full bleed a circular plate cuts it
off, and the tassel is the recognition anchor.

### Construction notes

The crown is drawn **first**, so the board sits on top of it. Without the crown
the board is just a diamond and the mark stops saying "cap" at all.

The hand is not one path. The ring is the thumb and index as a stroked circle;
the palm and three fingers are separate strokes that merge into a single
silhouette. Drawn as one filled shape the counter inside the ring closes up at
small sizes, and the whole thing turns into a blob.

The tassel is anchored at the board's right corner, which is also the pivot the
swing animation rotates around.

## Alternatives considered and rejected

| Idea | Why it lost |
| --- | --- |
| Cap cut with a real vertical edge | Read as a pennant on a pole. A right-pointing triangle needs the crown above and the button over it before anyone sees a graduation cap. |
| Mortarboard that doubles as a message bubble | The earlier mark. Legible, but it said "school" and "texting" without saying anything about the thing doing the work. |
| Letter mark, a "C" in a rounded square | Exactly the low-effort result the brief ruled out. Says nothing. |
| Bell or alarm glyph | Describes nagging, which is one feature, not the product. |

## Tones

Three, defined in one table in the component so nobody invents a fourth.

- `brand` (default): the hand carries a dark-to-working-blue gradient, the cap
  is light. For white and light backgrounds.
- `white`: the hand flips to white so the mark keeps its weight on navy
  sections, which is where the footer and closing CTA now sit.
- `ink`: one hue at three values. For the favicon, print, embroidery, and
  anywhere a gradient dies.

## Wordmark

Bricolage Grotesque ExtraBold, tracking tightened to -0.03em, set solid next to
the mark. It is a face with real character, so it sits beside a characterful
mark without either fighting the other.

The name is always **Classistant**, one word, capital C only. Never
"ClassistantAI" in user-facing copy; the repo is named that for historical
reasons.

## Rules

- Do not rotate the mark. The hand establishes an up direction.
- Do not mirror it. See above: the direction the hand faces is load-bearing.
- Do not recolour the tassel independently. It is the recognition anchor.
- The tassel swing (`animated` prop) is for moments of arrival only: the closing
  CTA and the onboarding success screen. Not the header, where a permanently
  moving logo is a distraction.
- Minimum size 20px. Below that the counter inside the hand's ring closes. That
  is 20px of **mark**, not of plate: a 20px `LogoPlate` holds a 15px mark and is
  too small. 28px of plate is the practical floor.
- **Never redraw it inline.** The old mortarboard-bubble survived for months in
  four hand-rolled copies (both call screens, the hero thread avatar, the
  feature-wall handset) after the mark itself changed, because each was an
  anonymous `<svg>` in a layout file rather than an import. Import `LogoMark` or
  `LogoPlate`. The favicon is the single sanctioned copy, and it is called out
  above for the same reason.
