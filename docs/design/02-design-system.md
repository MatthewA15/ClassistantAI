# 02. Design system

Tokens live in one place: [`app/globals.css`](../../src/frontend/app/globals.css),
inside Tailwind v4's `@theme` block. There is no `tailwind.config.js`, on purpose,
so there is exactly one file to look in.

## Palette

Three families, and nothing else.

| Family | Range | Used for |
| --- | --- | --- |
| `ink` | 950 to 600 | Dark sections, headings, the "serious now" states |
| `brand` | 700 to 400 | Buttons, links, focus rings, the working blue |
| `sky` | 500 to 50 | Fills, chips, illustration, everything soft |

Plus white and four cooled neutrals (`paper`, `line`, `body`, `body-soft`). The
neutrals are tinted blue rather than pure grey so nothing on the page reads as
grey-brown next to the blues.

### The constraint that shaped the most decisions

**No purple, and no separate alert colour.**

Purple was ruled out by the brief. The harder call was urgency: a product whose
main feature is escalating pressure normally reaches for amber and red. We did
not, because introducing red would have meant introducing a whole fourth ramp for
a handful of chips, and the palette would stop reading as one system.

Urgency is carried by **depth and motion instead of hue**. The escalation section
sits on `ink-900`, its final rung has a pulsing ring, and the ladder line rises.
Nothing turns red. This is a deliberate trade: slightly less instant "danger"
signalling, in exchange for a page that stays visually coherent end to end.

### The one sanctioned exception

The Google sign-in button uses Google's four brand colours. Google's branding
guidelines require it, and a recoloured Google logo is both a trademark problem
and a trust problem on a sign-in screen. It appears exactly once, in
`OnboardingWizard`. Do not add a second exception without a reason this good.

## Type

- **Display** (`--font-display`): Plus Jakarta Sans, 500 to 800. Headings and
  the wordmark. Tracking is tightened to -0.022em globally because the face runs
  loose at display sizes.
- **Body** (`--font-sans`): Inter. Everything else.

Both are loaded through `next/font/google`, so they self-host at build time. No
runtime request to Google, which also keeps the privacy story honest.

`text-wrap: balance` on headings and `text-wrap: pretty` on paragraphs, so we
never hand-place line breaks.

## Shape and depth

- Cards: `1.25rem` radius. Screenshot frames: `1.4rem`. Phone: `2.4rem`.
  Generous, but short of the blobby look.
- Two shadows only, `--shadow-soft` and `--shadow-lift`, both tinted with ink
  rather than black so they sit in the blue world.
- Nearly every surface also carries a `ring-1 ring-line`. The hairline is what
  keeps light cards legible on the `paper` background where shadow alone is too
  faint.

## Writing rules

These are what keep the page from reading as machine-written.

1. **No em dashes.** Comma, period, or parentheses.
2. **No badge chip above a heading.** The little pill with a dot in it is the
   single clearest tell of an AI-generated landing page. `SectionHeading` takes a
   plain uppercase `label` string instead, with no container around it.
3. **No hype verbs.** No "unlock", "elevate", "seamless", "supercharge",
   "revolutionise", "in today's fast-paced world".
4. **Say the unflattering thing.** "It will sometimes get a date wrong" and "we
   have to hold your password" build more trust than any reassurance graphic.
5. **Second person, present tense, short sentences.** The product texts like a
   person, so the site should sound like the product.

## Accessibility

- Focus is never removed. `:focus-visible` gets a 2px brand outline with 3px
  offset, defined once in base styles.
- All decorative SVG is `aria-hidden`. Every meaningful icon sits next to real
  text rather than replacing it.
- The FAQ is `<details>` and `<summary>`, so it opens with no JavaScript at all.
- A skip link is the first focusable element on every page.
- Body text is `--color-body` (#3f5a76) on white, which clears WCAG AA. The
  lighter `--color-body-soft` is for supporting text at 0.8rem and above only,
  never for anything a user has to read to complete a task.
