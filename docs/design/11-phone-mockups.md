# 11. Phone mockups

Sources: [`components/landing/sceneParts.tsx`](../../src/frontend/components/landing/sceneParts.tsx),
[`components/landing/EscalationScene.tsx`](../../src/frontend/components/landing/EscalationScene.tsx),
[`components/ui/PhoneShowcase.tsx`](../../src/frontend/components/ui/PhoneShowcase.tsx),
[`components/landing/Features.tsx`](../../src/frontend/components/landing/Features.tsx)

There are four fake phones on the site: the hero showcase, the escalation scene
in the showcase strip, the small ringing handset on the feature wall, and the
inbox and syllabus scenes. The product is a thread and a phone call, so these
carry more of the argument than any paragraph does, and a mockup that is
slightly wrong is worse than an obvious illustration: the eye knows what a
lockscreen looks like.

## `PhoneFrame` has two screens, and the variant is a parameter

`app` keeps the white chrome, a light status row and padded content, for a scene
showing something running inside an app. `full` hands the entire screen to the
child, for a lock or call screen drawn edge to edge in its own wallpaper.

Before the variant existed, the dark screens faked it: `-m-2.5` plus
`h-[calc(100%+1.25rem)]` to reach back over the frame's padding. That fails in
two visible ways. The negative margin cancels the padding but not the status row
above it in flow, so a sliver of the light row stayed on screen with the clock
clipped in half, and the overhanging height pushed the bottom of the screen out
under `overflow-hidden`. It also put **two clocks on one phone**: the frame's
hardcoded 9:41 and the lockscreen's own.

The variant is a prop rather than classes appended by the caller because the two
disagree about padding and background, and competing utilities in one class list
are settled by Tailwind's emission order. This is the same trap documented in
[03](03-landing-page.md).

**The status bar clock is optional.** A lock screen passes no `time`: it prints
the time in 30px type a few millimetres below, and phones drop the small one for
exactly that reason. A call screen passes its own, because a real one keeps the
clock running up there.

## The escalation scene's dates come from the tally

The scene counts days off a November calendar in groups of five, cutting to the
phone each time a group closes. The lockscreen used to read `Friday 14 November`
and `9:41` at every cut, which contradicted the calendar the viewer had just
watched tick from day 5 to day 20.

The date is now `daysAt(t)`, the same counter the calendar renders, so the
lockscreen cannot show a day the calendar never reached. The weekday is derived
too: November 2026 opens on a Sunday, so `WEEKDAYS[(day - 1) % 7]` gets it with
no `Date` object involved. Hardcoding one weekday per beat would have drifted the
first time a beat moved, which is how the original got wrong.

Only the clock is per-beat data, and it is doing work: 9:41 on the Thursday, 6:12
on the Tuesday evening, 7:58 on the Sunday morning, and the call at 5:30 on the
Friday. All inside waking hours, because quiet hours are a promise the product
makes on the same page and a 3am screenshot would contradict it.

The big clock runs bare, the way a phone does, so the meridiem is spelled out
once in the corner of the notification card. That is what settles whether 6:12
was morning or evening.

Copy that states a number has to match the calendar behind it. The amber note
said "two weeks left" while the calendar counter beside it read 20 days.

## Notification tint is the one deliberate non-blue

Green, amber, red on the lockscreen cards. Hue is the only signal a reader
decodes without being taught it, and the whole point of the scene is that the
same reminder gets louder. The tally's closing stroke stays brand blue: red is
reserved for the deadline cell, and a red stroke every fifth day would stop
meaning anything.

## The mark on a phone is the app icon, not a bare glyph

Anywhere a mockup shows Classistant as a contact or a caller, it uses
`LogoPlate` from [01](01-brand-and-logo.md), which is the mark on a plate. The
plate parameter picks the tone with it, because the two are not independent: the
`white` tone's crown is brand blue and disappears on a blue plate, and the
`brand` tone's hand is near-navy and disappears on a dark one. Call screens take
the white plate, since they sit on a near-black wallpaper.

Thread avatars are 28px, not the 20px they were. The mark's ring closes below
20px of *mark*, and a 20px plate left only 15px of it. 28px is also closer to
what iOS actually draws there.

## Feature-wall handset

The `It calls you` tile is the tallest on the wall, three rows on `lg`. Its
phone was capped at a fixed 5.2rem and sat in the top third with the label
pinned to the bottom, leaving a hole big enough to read as a loading state.

Height now comes from the tile and width from the phone's own 1:2 proportions,
with `max-w-full` giving way on the narrow phone grid. That also removed
`Tile`'s `align` prop: art that should reach the edges of a taller box grows
with `flex-1`, which fills the space, instead of `justify-between` pushing two
small things apart.

Answer and decline carry the handset glyph rather than being bare colour dots.
Two circles alone read as a traffic light.
