# 03. Landing page

Source: [`app/page.tsx`](../../src/frontend/app/page.tsx)

## The argument the page has to make

A student arrives sceptical of two things: that another reminder app will help,
and that handing over their school password is sane. The section order is built
to answer those in that order, and to earn the password ask before making it.

| Section | Job |
| --- | --- |
| `Hero` | Show the product in its actual medium, a text thread. Not a dashboard. |
| `SchoolStrip` | Immediate "is this for me" filter, using real supported schools. |
| `HowItWorks` | Collapse the setup fear. Four steps, one of which is yours. |
| `Showcase` | Prove the three hardest claims with screen-level detail. |
| `Features` | The complete list, for the reader who wants to check for their thing. |
| `Escalation` | The differentiator. This is the section people will remember. |
| `Schools` | The eligibility answer, with the honest reason the list is short. |
| `Safety` | Now that they want it, address the password. Not before. |
| `Faq` | Objections we cannot fit elsewhere. |
| `CtaBand` | Ask, with the seasonal urgency that is actually real. |

## Decisions worth defending

**The hero shows a phone, not a dashboard.** Classistant is Messages-native. A
dashboard hero would misrepresent the product and set up the wrong expectation.
The web dashboard appears once, later, framed as "where you check its work".

**`Safety` comes after `Escalation`, not before.** Putting security up front
sounds defensive and plants a doubt the reader did not have yet. Placed after the
reader wants the product, the same content reads as candour.

**The escalation section is the only dark section in the body.** It is the
emotional peak of the page and the thing no competitor does. The tone shift is
the point. `CtaBand` reuses navy so the page closes where its peak was.

**The four How it works cards are round objects with light under them.** Corners
run ~2.5rem and drift on a 16s `card-morph` loop, and each card floats over its
own blurred `--color-accent` blob, so the light picks up the school's colour once
one is chosen. Same idea as the header capsules, and the four delays are offset
so they do not breathe in unison, which reads as one animation applied four times
rather than four objects. `card-morph` keeps its radii in **rem, not the
percentages `glow-morph` uses**: percentage radii on a card this size turn it
into a blob and eat the corners of the artwork inside.

The wrapper needs `isolate`. Nothing between the card and the root makes a
stacking context, so the `-z-10` light paints *underneath* the section's own
`bg-paper` and is simply invisible.

**Twelve feature cards, one flat grid, no grouping.** Grouping into three
labelled clusters was tried and dropped: it added three headings of chrome to
help with scanning that a 3-column grid already does. The order still runs setup
to calendar to watching to escalation, so the arc survives without the labels.

**Screenshot placeholders are drawn, not grey.** Each `PlaceholderShot` variant
sketches the real screen's structure so crop, aspect ratio, and page rhythm are
already correct when real captures arrive. Each carries a visible "Screenshot
placeholder" tag so one cannot ship unnoticed. Replace the skeleton with
`<Image>`, keep the wrapper.

## Phones

**Three pills on phones too, and no hamburger.** The menu behind it held the two
sections the switcher already lists plus the Get set up button sitting next to
it, so it was a tap that cost a tap. All three capsules fit across 320px once the
brand capsule drops to the mark alone in a circle the same height as its
siblings. That is the trade: about 80px of wordmark buys the other two pills, and
the hero one scroll above already spells the name out.

**The feature wall needs `grid-auto-flow: dense`, and it is not decoration.** The
brand plate is pinned on `lg` and half the tiles span two tracks, so under plain
sparse flow the placement cursor never goes back: a two-column tile that will not
fit in what is left of a row starts a new one and abandons the tail of the old
one. It went missing at some point and the phone grid was carrying three dead
cells, about 22rem of nothing, beside the tall phone tile.

**Wide-wall spans do not survive a two-column grid.** A three-row tile becomes a
22rem sliver half a screen wide, and the brand plate becomes a 15rem slab of
gradient with a 38px mark adrift in it. `Tile` therefore takes phone overrides
(`mCol`/`mRow`) separately from its `lg` spans, emitted as base and `sm:`
utilities rather than merged, because `cn` is a plain joiner and two spans at one
breakpoint would be settled by emission order instead of intent.

**Tall tiles grow their art, they do not spread their contents.** The three-row
`It calls you` tile used to run `justify-between` with a fixed 5.2rem handset,
which pinned a small phone to the top and a label to the bottom and left a hole
between them big enough to read as a loading state. The phone now takes the
slack with `flex-1`, sized off the tile's height and its own 1:2 proportions.
`Tile` lost its `align` prop with that change. Worth remembering why it existed:
`justify-between` passed through `className` lost to the `justify-center`
already in the base string, silently, for as long as it was written that way.

**The closing CTA's height is what decides when the footer arrives.** `CtaBand`
and `Footer` are the same ink with no border between them, so "the footer
appears" really means "the footer's first row of links clears the fold", 56px
past the section end. The headline is centred in the section, so the footer lands
on screen only while the section is shorter than the viewport minus 112px. At
52rem that was half a screen of scrolling through empty ink after the headline;
38rem lands it on a 720px laptop. The floor is 516px, which is `py-24` plus the
headline block, below which the padding takes over.

The FAQ bubbles are positioned in percentages of that height and are tuned to
their measured thread heights, which run 74px to 110px depending on how far each
answer wraps. The two columns do not share a row rhythm because each spreads its
own four threads evenly, which is also what stops them reading as a table. Both
start at 14.5%, the first row clear of the fixed header. Shorten the section or
let an answer wrap past two lines and the rows below it need re-spacing.

## Copy notes

The hero subhead ends on "There is no new app to remember to open." That sentence
is doing the heaviest lifting on the page: it is the entire reason a student
would pick this over a to-do app, and it is stated as a fact rather than a
benefit.

Numbers in copy come from `LIVE_SCHOOLS.length`, never typed. When a school is
verified and added, the page updates itself.
