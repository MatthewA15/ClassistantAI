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
| `Escalation` | Ladder line draws and rises, final node pulses | The rising line *is* the escalation. The pulse marks the phone call. |
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

Two decisions in it:

1. **Reveals never reverse.** Once shown, the observer disconnects. Content that
   re-animates when you scroll back up reads as a bug.
2. **Elements already on screen at mount skip the observer entirely.** Above-the-fold
   content shows immediately rather than waiting for an intersection callback,
   which otherwise produces a visible flash on load.

Line-draw animations key off the same `data-shown` attribute that `Reveal` sets,
so an SVG inside a revealing block draws at the moment the block appears rather
than on some independent timer.

## The no-JavaScript contract

Scroll-reveal hides content, which means a JavaScript failure could leave a blank
page. So the hiding rule only applies where scripting actually exists:

```css
@media (scripting: enabled) {
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
