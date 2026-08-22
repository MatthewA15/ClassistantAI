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

Source: [`components/brand/LogoMark.tsx`](../../src/frontend/components/brand/LogoMark.tsx)

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
- Do not recolour the tassel independently. It is the recognition anchor.
- The tassel swing (`animated` prop) is for moments of arrival only: the closing
  CTA and the onboarding success screen. Not the header, where a permanently
  moving logo is a distraction.
- Minimum size 20px. Below that the counter inside the hand's ring closes.
