# 01. Brand and logo

## The problem the mark has to solve

Classistant is two things at once: it is about school, and it lives in your text
messages. A logo that only says "school" looks like every other edtech product.
A logo that only says "chat" looks like a support widget. The mark had to fuse
both, and stay legible at 24px in a browser tab.

## What we built

A **mortarboard board that is also a message bubble.**

- The diamond is a graduation cap's board seen from above.
- Its three upper corners are softly rounded, but the **bottom corner comes to a
  near point**, which is what a chat bubble's tail does. That one asymmetry is
  what makes the shape read as both objects instead of a plain diamond.
- Two white bars sit inside it, which read as lines of text in a message.
- A **tassel** hangs off the right corner, cord plus bead. The tassel is what
  removes any remaining ambiguity: a diamond with a tassel is unmistakably a
  graduation cap.

Source: [`components/brand/LogoMark.tsx`](../../src/frontend/components/brand/LogoMark.tsx)

## Alternatives considered and rejected

| Idea | Why it lost |
| --- | --- |
| Letter mark, a "C" in a rounded square | Exactly the low-effort result the brief ruled out. Says nothing. |
| Speech bubble sitting on top of a mortarboard | Two whole objects stacked. Turned to mush below 32px. |
| Open book forming a bubble | Book shapes and bubble shapes fight each other; the silhouette read as neither. |
| Bell or alarm glyph | Describes nagging, which is one feature, not the product. |

## Tones

Three, defined in one table in the component so nobody invents a fourth.

- `brand` (default): board carries an ink-to-blue gradient. For white and light
  backgrounds.
- `white`: board flips to white so the mark keeps its visual weight on the navy
  sections. Tassel stays light blue, which is the one constant across tones.
- `ink`: flat single colour. For the favicon, print, embroidery, and anywhere a
  gradient will not survive.

## Wordmark

Plus Jakarta Sans ExtraBold, tracking tightened to -0.03em. Set solid next to the
mark with a 2.5 gap. It is a geometric humanist face, so it sits comfortably next
to a geometric mark without looking like a tech startup default.

The name is always **Classistant**, one word, capital C only. Never "ClassistantAI"
in user-facing copy. The repo is named that for historical reasons.

## Rules

- Do not rotate the mark. The tassel establishes an up direction.
- Do not recolour the tassel. It is the recognition anchor.
- The tassel swing animation (`animated` prop) is for moments of arrival only:
  the final CTA and the onboarding success screen. It is not for the header,
  where a permanently moving logo is distracting.
- Minimum size 20px. Below that the message bars close up.
