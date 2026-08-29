# 06. Motion and SVG

## Principle

Every animation on the site is either **showing the product working** or
**directing attention**. None of it is decoration for its own sake, and none of
it loops fast enough to compete with reading.

## Inventory

| Where | What | Why |
| --- | --- | --- |
| Hero backdrop | Concentric dashed rings expanding | A signal reaching a phone. The product's whole premise in one image. |
| `PhoneThread` | Bubbles stagger in, typing dots pulse forever | Makes the thread read as live. The never-finishing typing indicator is the trick. |
| Floating cards | Slow 9s vertical drift, offset delays | Separates them from the static phone so they read as system output. |
| `HowItWorks` | Dashed connector draws left to right | Turns four cards into one sequence. |
| `Escalation` | Days tally off a calendar, cutting to a lockscreen a shade louder each time, then the handset rings | The pressure is a function of time running out, not of the agent getting impatient. See [11](11-phone-mockups.md). |
| `ConnectScene` | Types the student's own school address, presses Continue with Google, cross-fades to the five permissions ticking | One sequence in two acts, because pressing the button is what produces the consent screen. See [13](13-connect-scenes.md). |
| `SealedPasswordScene` | Sealed envelope travels You to Classistant to School, then the clock runs to 3:16 AM and 10:26 AM and it goes again on its own | Answers "Classistant never sees your password" instead of asserting it, and shows that it is asked for once. See [13](13-connect-scenes.md). |
| `PlaceholderShot` | Chart path draws, calendar and inbox rows stagger in | Suggests real software populating rather than a static mock. |
| `LogoMark` | Tassel swings | Arrival moments only. See [01](01-brand-and-logo.md). |
| Step rail | Progress line grows by height transition | Cheapest possible sense of progress. |
| Feature cards | Lift and ring-brighten on hover | Standard affordance, kept subtle. |
| `SchoolStrip` | Marquee | Fits more names than fit on one line. |
| `Header` | Three blurred navy blobs morphing behind the pill | Reads as light emitted from behind a floating object. See below. |

## The floating header

The header is a detached capsule rather than a full-width bar, so the page reads
as sliding underneath it rather than under a lid. Behind it sit three heavily
blurred blobs of dark blue, running `glow-morph` on three different durations
(18s, 22s, 29s) with negative delays, so their overlap never repeats on a short
cycle.

Two things about it are worth knowing before editing:

**The pill's own radius does not animate.** Morphing `border-radius` on a 64px
capsule is mathematically invisible: anything above 32px clamps to the same
shape. That was tried first. The motion had to live in the light behind it
instead, where heavy blur turns a wobbling blob into something that reads as
breathing.

**Blur is what separates "light" from "smudge".** The blobs run 40 to 46px of
blur at 38 to 60 percent opacity. Drop the blur and they immediately look like
three navy shapes parked behind a button.

The wrapper is `pointer-events-none` with `pointer-events-auto` on the pill, so
the transparent gutter around the capsule never swallows clicks meant for the
page underneath.

### The section switcher

The four nav links became a single pill next to the logo
([`SectionNav`](../../src/frontend/components/site/SectionNav.tsx)). It names the
section you are currently in and opens a dropdown of the rest.

Two reasons: a floating capsule has far less horizontal room than a full-width
bar, and a label that tracks scroll position tells you something a flat row of
links never did, namely where you are.

- **Scrollspy** walks the sections on scroll (rAF-throttled) and keeps the last
  one whose top has passed 150px. That threshold sits just under the header, so
  a section becomes current as its heading reaches the pill, not when the
  section merely enters the viewport.
- **The first entry has no `id`.** It stands for the top of the page and is the
  resting state before the first real section, which is why the label reads
  "Overview" rather than defaulting to "How it works" while you are still in
  the hero.
- **The label has a fixed `min-width`.** Without it the pill resizes as you
  scroll ("FAQ" versus "How it works") and the header twitches.
- **The panel is fully opaque.** It was `bg-white/95` first, and even 5%
  transparency ghosted the 3rem hero headline through behind the menu items.
  On a menu that overlays display type, opaque is the only safe choice.
- On routes other than `/` the sections do not exist, so the spy is skipped and
  the links point back at `/#id`.

Keyboard: Escape closes and returns focus to the button, Arrow Down opens and
focuses the first item, and an outside pointer press closes it.

### A trap this exposed

Detaching the header removed the thing that was hiding a pre-existing bug. The
hero section is `overflow-hidden` (needed, or the left backdrop blob causes
horizontal scroll), and one blurred wash was positioned at `-top-40`, crossing
that boundary. `overflow-hidden` sliced the blur into a hard horizontal line
across the full page width, previously covered by the attached header.

**Keep blurred decoration clear of the top edge of any `overflow-hidden`
section.** A clipped blur is a visible seam, not a soft fade.

## How scroll reveal works

[`Reveal`](../../src/frontend/components/ui/Reveal.tsx) is a client component
using `IntersectionObserver`.

Three decisions in it:

1. **Reveals never reverse.** Once shown, the observer disconnects. Content that
   re-animates when you scroll back up reads as a bug.
2. **Elements already on screen at mount skip the observer entirely.** Above-the-fold
   content shows immediately rather than waiting for an intersection callback,
   which otherwise produces a visible flash on load.
3. **Phones do not reveal at all.** The hiding rule is gated on `min-width: 768px`.

Line-draw animations key off the same `data-shown` attribute that `Reveal` sets,
so an SVG inside a revealing block draws at the moment the block appears rather
than on some independent timer.

### Why phones are excluded

The reveal is an attention cue, and it only works where there is competition for
attention. On desktop two or three sections share the screen and the fade says
"read this one". On a phone there is only ever one section on screen, so the
fade has nothing to direct you away from and everything to take away from you:

- **It eats the tease.** The top slice of the next section, sitting just above
  the fold, is the thing that says keep scrolling. Held at `opacity: 0` until it
  intersects, that slice is blank, and the page looks like it ends there.
- **It fires constantly.** Every section is a full-screen intersection event, so
  a scroll down the page is an unbroken run of fades rather than a few accents.

So `.reveal` hides content only at `min-width: 768px`. Nothing else changes:
phones get the same markup, the observer still runs, `data-shown` still flips
for anything keyed to it. The content simply starts visible.

Test it at 390px wide with the fold parked mid-section — the next heading must
be readable in the sliver above the fold, at full opacity, before you scroll.

## The no-JavaScript contract

Scroll-reveal hides content, which means a JavaScript failure could leave a blank
page. So the hiding rule only applies where scripting actually exists:

```css
@media (scripting: enabled) and (min-width: 768px) {
  .reveal { opacity: 0; ... }
}
```

With JavaScript off or broken, the block never applies and the full page renders
normally. Verified by loading the site in Chrome with `--disable-javascript`:
every section shows at full opacity. The FAQ uses `<details>` for the same reason.

### Why not the usual `.js` class trick

The first version used the conventional approach: an inline script in
`layout.tsx` adding a `js` class to `<html>`, with CSS scoped to `.js .reveal`.
It worked, but it **caused a React hydration error** on every page. The server
rendered `<html class="__variable_...">` and the client saw that plus `js`, and
React flagged the attribute mismatch.

The usual patch is `suppressHydrationWarning` on `<html>`, which silences the
warning rather than fixing the cause. The `scripting` media feature removes the
script entirely, so there is nothing to mismatch. It needs Chrome 120, Safari 17,
or Firefox 113, and anything older just shows content immediately with no
animation, which is the correct degradation anyway.

## Reduced motion

One global block in `globals.css` collapses every animation and transition to
0.001ms under `prefers-reduced-motion: reduce`, forces `.reveal` visible, and
zeroes every `stroke-dashoffset` so line-draw SVGs render complete.

Anything looping also carries `motion-safe:` so it never starts in the first
place. **Both belong on any new animation:** `motion-safe:` prevents the loop,
the global block catches anything that slips through.

Test it: macOS System Settings, Accessibility, Display, Reduce motion. The page
must be fully readable and complete, just still.
